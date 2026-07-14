import uuid
from datetime import date

import pytest

from app.db.session import AsyncSessionLocal
from app.models.company import Company
from app.models.enums import PeriodType
from app.models.financial_statement import FinancialStatement
from app.models.organization import Organization
from app.repositories.financial_statement import FinancialStatementRepository
from app.repositories.metric import MetricRepository
from app.services.metrics.orchestrator import compute_and_store_metrics
from app.services.metrics.registry import METRIC_REGISTRY


async def _create_org_and_company(db) -> tuple[Organization, Company]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"Org-{suffix}", slug=f"org-{suffix}")
    db.add(org)
    await db.flush()
    company = Company(
        organization_id=org.id,
        name="Senus",
        industry="Software",
        fiscal_year_end="06-30",
        currency="EUR",
    )
    db.add(company)
    await db.flush()
    return org, company


@pytest.mark.asyncio
async def test_create_many_persists_every_row_with_a_distinct_id_from_one_flush():
    async with AsyncSessionLocal() as db:
        org, company = await _create_org_and_company(db)
        statements = [
            FinancialStatement(
                organization_id=org.id,
                company_id=company.id,
                document_id=None,
                taxonomy_code=code,
                value=1000,
                currency="EUR",
                period_start=date(2025, 7, 1),
                period_end=date(2025, 12, 31),
                period_type=PeriodType.HY,
                confidence_score=None,
                source_excerpt=None,
                source_page=None,
                extracted_by="ai",
            )
            for code in ("REVENUE", "COST_OF_GOODS_SOLD", "EBITDA")
        ]

        created = await FinancialStatementRepository(db).create_many(statements)
        await db.commit()

        assert len(created) == 3
        assert len({s.id for s in created}) == 3
        assert all(s.id is not None for s in created)

        persisted = await FinancialStatementRepository(db).list_for_company(
            company_id=company.id, organization_id=org.id
        )
        assert {s.taxonomy_code for s in persisted} == {"REVENUE", "COST_OF_GOODS_SOLD", "EBITDA"}


@pytest.mark.asyncio
async def test_compute_and_store_metrics_writes_exactly_the_registered_metric_set():
    async with AsyncSessionLocal() as db:
        org, company = await _create_org_and_company(db)
        period_start, period_end = date(2025, 7, 1), date(2025, 12, 31)
        statements = [
            FinancialStatement(
                organization_id=org.id,
                company_id=company.id,
                document_id=None,
                taxonomy_code=code,
                value=value,
                currency="EUR",
                period_start=period_start,
                period_end=period_end,
                period_type=PeriodType.HY,
                confidence_score=None,
                source_excerpt=None,
                source_page=None,
                extracted_by="ai",
            )
            for code, value in (
                ("REVENUE", 1_000_000),
                ("COST_OF_GOODS_SOLD", 400_000),
                ("EBITDA", 250_000),
            )
        ]
        await FinancialStatementRepository(db).create_many(statements)
        await db.commit()

        created = await compute_and_store_metrics(
            db, organization_id=org.id, company_id=company.id, period_end=period_end
        )

        # Every registry key gets a row (value=None + reason for ones that
        # couldn't be computed) - this is the invariant get_or_compute_metrics
        # relies on to decide whether a cached period is stale.
        assert {m.metric_key for m in created} == set(METRIC_REGISTRY.keys())

        by_key = {m.metric_key: m for m in created}
        assert float(by_key["revenue"].value) == pytest.approx(1_000_000)
        assert float(by_key["ebitda_margin"].value) == pytest.approx(25.0)
        assert float(by_key["cogs_pct_of_revenue"].value) == pytest.approx(40.0)

        persisted = await MetricRepository(db).list_for_period(
            company_id=company.id, organization_id=org.id, period_end=period_end
        )
        assert len(persisted) == len(METRIC_REGISTRY)


@pytest.mark.asyncio
async def test_recompute_replaces_the_period_without_leaving_duplicate_or_orphaned_rows():
    async with AsyncSessionLocal() as db:
        org, company = await _create_org_and_company(db)
        period_start, period_end = date(2025, 7, 1), date(2025, 12, 31)
        await FinancialStatementRepository(db).create_many(
            [
                FinancialStatement(
                    organization_id=org.id,
                    company_id=company.id,
                    document_id=None,
                    taxonomy_code="REVENUE",
                    value=500_000,
                    currency="EUR",
                    period_start=period_start,
                    period_end=period_end,
                    period_type=PeriodType.HY,
                    confidence_score=None,
                    source_excerpt=None,
                    source_page=None,
                    extracted_by="ai",
                )
            ]
        )
        await db.commit()

        await compute_and_store_metrics(
            db, organization_id=org.id, company_id=company.id, period_end=period_end
        )
        second_run = await compute_and_store_metrics(
            db, organization_id=org.id, company_id=company.id, period_end=period_end
        )

        persisted = await MetricRepository(db).list_for_period(
            company_id=company.id, organization_id=org.id, period_end=period_end
        )
        assert len(persisted) == len(METRIC_REGISTRY)
        assert {m.id for m in persisted} == {m.id for m in second_run}
