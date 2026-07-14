import uuid
from datetime import date

import pytest

from app.db.session import AsyncSessionLocal
from app.models.company import Company
from app.models.enums import PeriodType, StatementStatus
from app.models.financial_statement import FinancialStatement
from app.models.organization import Organization
from app.repositories.financial_statement import FinancialStatementRepository
from app.services.validation.service import run_validation

# The real Senus PLC HY2026 filing's figures (read directly from the source
# PDF - see tests/fixtures/senus_hy2026_ground_truth.json), used here because
# they're a genuine real-world case where all four identities hold with the
# ±1 rounding tolerance the filing itself exhibits (140,135 - 410,291 - 8,500
# + 1,013,846 = 735,190, one off from the filing's own stated 735,189).
SENUS_HY2026_VALUES = {
    "REVENUE": 354_813,
    "COST_OF_GOODS_SOLD": 64_861,
    "GROSS_PROFIT": 289_952,
    "NET_ASSETS": 561_081,
    "TOTAL_EQUITY": 561_081,
    "CASH_OPENING": 140_135,
    "NET_OPERATING_CASH_FLOW": -410_291,
    "NET_INVESTING_CASH_FLOW": -8_500,
    "NET_FINANCING_CASH_FLOW": 1_013_846,
    "CASH_CLOSING": 735_189,
    "CASH_AND_EQUIVALENTS": 735_189,
}

PERIOD_START, PERIOD_END = date(2025, 7, 1), date(2025, 12, 31)


async def _create_org_and_company(db) -> tuple[Organization, Company]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"Org-{suffix}", slug=f"org-{suffix}")
    db.add(org)
    await db.flush()
    company = Company(organization_id=org.id, name="Senus", currency="EUR")
    db.add(company)
    await db.flush()
    return org, company


async def _create_statements(db, org, company, values: dict[str, float]) -> dict[str, FinancialStatement]:
    statements = [
        FinancialStatement(
            organization_id=org.id,
            company_id=company.id,
            taxonomy_code=code,
            value=value,
            currency="EUR",
            period_start=PERIOD_START,
            period_end=PERIOD_END,
            period_type=PeriodType.HY,
            extracted_by="ai",
        )
        for code, value in values.items()
    ]
    created = await FinancialStatementRepository(db).create_many(statements)
    await db.commit()
    return {s.taxonomy_code: s for s in created}


@pytest.mark.asyncio
async def test_all_four_identities_pass_for_the_real_senus_hy2026_figures():
    async with AsyncSessionLocal() as db:
        org, company = await _create_org_and_company(db)
        by_code = await _create_statements(db, org, company, SENUS_HY2026_VALUES)

        results = await run_validation(
            db, company_id=company.id, organization_id=org.id, period_start=PERIOD_START, period_end=PERIOD_END
        )
        await db.commit()

        assert {r.rule_name for r in results} == {
            "gross_profit_equals_revenue_minus_cost_of_sales",
            "net_assets_equals_total_equity",
            "cash_bridge_sums_to_closing_cash",
            "cash_flow_closing_cash_matches_balance_sheet_cash",
            # REVENUE is present too, so its sanity check runs alongside the
            # four identity checks (354,813 is well within the plausible range).
            "revenue_scale_sanity_check",
        }
        assert all(r.passed for r in results), [(r.rule_name, r.delta) for r in results if not r.passed]

        async with AsyncSessionLocal() as fresh_db:
            refreshed = await FinancialStatementRepository(fresh_db).get_by_id(
                by_code["GROSS_PROFIT"].id, organization_id=org.id
            )
            assert refreshed.status == StatementStatus.CONFIRMED


@pytest.mark.asyncio
async def test_failed_gross_profit_check_only_flags_the_subtotal_not_its_base_inputs():
    # Real-world case this fixes: Senus PLC's own published HY2025 comparative
    # figures have gross profit off by exactly 1,000 from revenue-cost_of_sales
    # (a typo/rounding issue in their own filing) - REVENUE and
    # COST_OF_GOODS_SOLD are base ledger figures used consistently elsewhere
    # (e.g. the Revenue Trend chart) and shouldn't be hidden just because the
    # separately-typed GROSS_PROFIT subtotal doesn't reconcile.
    async with AsyncSessionLocal() as db:
        org, company = await _create_org_and_company(db)
        bad_values = dict(SENUS_HY2026_VALUES)
        bad_values["GROSS_PROFIT"] = 999_999  # deliberately wrong vs revenue - cost_of_sales
        by_code = await _create_statements(db, org, company, bad_values)

        results = await run_validation(
            db, company_id=company.id, organization_id=org.id, period_start=PERIOD_START, period_end=PERIOD_END
        )
        await db.commit()

        gross_profit_result = next(r for r in results if r.rule_name == "gross_profit_equals_revenue_minus_cost_of_sales")
        assert gross_profit_result.passed is False
        assert gross_profit_result.expected_value == pytest.approx(999_999)
        assert gross_profit_result.actual_value == pytest.approx(354_813 - 64_861)

        async with AsyncSessionLocal() as fresh_db:
            fs_repo = FinancialStatementRepository(fresh_db)
            refreshed_gross_profit = await fs_repo.get_by_id(by_code["GROSS_PROFIT"].id, organization_id=org.id)
            assert refreshed_gross_profit.status == StatementStatus.NEEDS_REVIEW
            # REVENUE and COST_OF_GOODS_SOLD stay CONFIRMED - only the
            # subtotal that failed to reconcile is flagged.
            for code in ("REVENUE", "COST_OF_GOODS_SOLD"):
                refreshed = await fs_repo.get_by_id(by_code[code].id, organization_id=org.id)
                assert refreshed.status == StatementStatus.CONFIRMED, code
            # Unrelated identity (net assets) must be unaffected by the gross-profit failure.
            refreshed_net_assets = await fs_repo.get_by_id(by_code["NET_ASSETS"].id, organization_id=org.id)
            assert refreshed_net_assets.status == StatementStatus.CONFIRMED


@pytest.mark.asyncio
async def test_failed_two_way_comparison_flags_both_sides():
    # net_assets_equals_total_equity has no "more trustworthy" side - unlike
    # the gross-profit case above, both independently-stated figures should
    # be flagged when they disagree.
    async with AsyncSessionLocal() as db:
        org, company = await _create_org_and_company(db)
        bad_values = dict(SENUS_HY2026_VALUES)
        bad_values["NET_ASSETS"] = 999_999
        by_code = await _create_statements(db, org, company, bad_values)

        await run_validation(
            db, company_id=company.id, organization_id=org.id, period_start=PERIOD_START, period_end=PERIOD_END
        )
        await db.commit()

        async with AsyncSessionLocal() as fresh_db:
            fs_repo = FinancialStatementRepository(fresh_db)
            for code in ("NET_ASSETS", "TOTAL_EQUITY"):
                refreshed = await fs_repo.get_by_id(by_code[code].id, organization_id=org.id)
                assert refreshed.status == StatementStatus.NEEDS_REVIEW, code


@pytest.mark.asyncio
async def test_identity_rules_are_skipped_entirely_when_their_inputs_are_missing():
    async with AsyncSessionLocal() as db:
        org, company = await _create_org_and_company(db)
        # Only REVENUE - none of the four identity rules' required codes are
        # present, so none of them should produce a ValidationResult at all
        # (as opposed to a result that's marked failed for missing data).
        await _create_statements(db, org, company, {"REVENUE": 354_813})

        results = await run_validation(
            db, company_id=company.id, organization_id=org.id, period_start=PERIOD_START, period_end=PERIOD_END
        )
        await db.commit()

        # Only the single-field revenue-scale check ran; every identity rule
        # needs at least one other code that isn't present here.
        assert [r.rule_name for r in results] == ["revenue_scale_sanity_check"]
        assert results[0].passed is True


@pytest.mark.asyncio
async def test_revenue_scale_sanity_check_flags_an_implausible_value():
    async with AsyncSessionLocal() as db:
        org, company = await _create_org_and_company(db)
        # A unit-conversion slip: 354,813 misread as 354,813,000 (over the
        # 100,000,000 upper bound) rather than normalized correctly.
        by_code = await _create_statements(db, org, company, {"REVENUE": 354_813_000})

        results = await run_validation(
            db, company_id=company.id, organization_id=org.id, period_start=PERIOD_START, period_end=PERIOD_END
        )
        await db.commit()

        assert len(results) == 1
        result = results[0]
        assert result.rule_name == "revenue_scale_sanity_check"
        assert result.passed is False
        assert result.actual_value == pytest.approx(354_813_000)
        assert result.expected_value == pytest.approx(100_000_000)

        async with AsyncSessionLocal() as fresh_db:
            refreshed = await FinancialStatementRepository(fresh_db).get_by_id(
                by_code["REVENUE"].id, organization_id=org.id
            )
            assert refreshed.status == StatementStatus.NEEDS_REVIEW


@pytest.mark.asyncio
async def test_revalidation_flips_a_previously_needs_review_statement_back_to_confirmed():
    async with AsyncSessionLocal() as db:
        org, company = await _create_org_and_company(db)
        bad_values = dict(SENUS_HY2026_VALUES)
        bad_values["GROSS_PROFIT"] = 999_999
        by_code = await _create_statements(db, org, company, bad_values)
        await run_validation(
            db, company_id=company.id, organization_id=org.id, period_start=PERIOD_START, period_end=PERIOD_END
        )
        await db.commit()

    async with AsyncSessionLocal() as db:
        # Analyst corrects the value (same statement row, same taxonomy_code/period).
        fs_repo = FinancialStatementRepository(db)
        statement = await fs_repo.get_by_id(by_code["GROSS_PROFIT"].id, organization_id=org.id)
        assert statement.status == StatementStatus.NEEDS_REVIEW
        statement.value = 289_952
        await db.commit()

        await run_validation(
            db, company_id=company.id, organization_id=org.id, period_start=PERIOD_START, period_end=PERIOD_END
        )
        await db.commit()

        refreshed = await fs_repo.get_by_id(by_code["GROSS_PROFIT"].id, organization_id=org.id)
        assert refreshed.status == StatementStatus.CONFIRMED
