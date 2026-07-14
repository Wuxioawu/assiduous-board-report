import uuid
from datetime import date

import pytest

from app.models.company import Company
from app.models.enums import PeriodType
from app.models.financial_statement import FinancialStatement
from app.services.charts.registry import (
    ChartBuildContext,
    build_cash_flow_bridge,
    build_current_ratio_excl_contingent_card,
    build_current_ratio_incl_contingent_card,
    build_interest_cover_card,
    build_margin_breakdown,
    build_net_cash_card,
    build_revenue_card,
    build_revenue_trend,
)

# The real Senus PLC HY2026 figures (see tests/fixtures/senus_hy2026_ground_truth.json).
HY2026_VALUES = {
    "REVENUE": 354_813,
    "COST_OF_GOODS_SOLD": 64_861,
    "GROSS_PROFIT": 289_952,
    "NET_INCOME": -485_144,
    "CASH_OPENING": 140_135,
    "NET_OPERATING_CASH_FLOW": -410_291,
    "NET_INVESTING_CASH_FLOW": -8_500,
    "NET_FINANCING_CASH_FLOW": 1_013_846,
    "CASH_CLOSING": 735_189,
}
PERIOD_START, PERIOD_END = date(2025, 7, 1), date(2025, 12, 31)


def _company(**overrides) -> Company:
    defaults = dict(
        id=uuid.uuid4(), organization_id=uuid.uuid4(), name="Senus", currency="EUR", fiscal_year_start_month=7
    )
    defaults.update(overrides)
    return Company(**defaults)


def _statement(taxonomy_code: str, value: float, *, source_excerpt: str = "excerpt") -> FinancialStatement:
    return FinancialStatement(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        company_id=uuid.uuid4(),
        taxonomy_code=taxonomy_code,
        value=value,
        currency="EUR",
        period_start=PERIOD_START,
        period_end=PERIOD_END,
        period_type=PeriodType.HY,
        source_excerpt=source_excerpt,
        source_page=5,
        extracted_by="ai",
    )


def _statements(values: dict[str, float]) -> list[FinancialStatement]:
    return [_statement(code, value) for code, value in values.items()]


def test_cash_flow_bridge_matches_real_senus_figures():
    ctx = ChartBuildContext(statements=_statements(HY2026_VALUES), company=_company())
    series = build_cash_flow_bridge(ctx)

    assert len(series) == 1
    points = series[0].points
    assert [p.step_label for p in points] == [
        "Opening Cash", "Operating", "Investing", "Financing", "Closing Cash",
    ]
    assert [p.value for p in points] == [140_135, -410_291, -8_500, 1_013_846, 735_189]
    # 140,135 - 410,291 - 8,500 + 1,013,846 = 735,190, one off from the
    # filing's own stated 735,189 (rounding) - ValidationService's ±1
    # tolerance covers this; the waterfall displays the filing's own figures
    # verbatim rather than a computed sum.
    opening, operating, investing, financing, closing = [p.value for p in points]
    assert abs((opening + operating + investing + financing) - closing) <= 1

    for point in points:
        assert len(point.source_refs) == 1


def test_cash_flow_bridge_omitted_when_any_of_the_five_fields_is_missing():
    incomplete = dict(HY2026_VALUES)
    del incomplete["NET_FINANCING_CASH_FLOW"]
    ctx = ChartBuildContext(statements=_statements(incomplete), company=_company())

    assert build_cash_flow_bridge(ctx) == []


def test_cash_flow_bridge_excludes_needs_review_rows_since_they_are_never_passed_in():
    # The builder trusts its caller (see api/v1/routes/charts.py) to have
    # already filtered to CONFIRMED-only statements - this test documents
    # that a statement simply absent from ctx.statements (as a needs_review
    # row would be, post-filtering) makes the whole bridge unavailable rather
    # than silently using a partial/wrong waterfall.
    statements = _statements(HY2026_VALUES)
    excluding_closing_cash = [s for s in statements if s.taxonomy_code != "CASH_CLOSING"]
    ctx = ChartBuildContext(statements=excluding_closing_cash, company=_company())

    assert build_cash_flow_bridge(ctx) == []


def test_revenue_trend_uses_most_recent_period_for_multiple_periods():
    earlier = _statement("REVENUE", 340_931)
    earlier.period_start, earlier.period_end = date(2024, 7, 1), date(2024, 12, 31)
    later = _statement("REVENUE", 354_813)
    ctx = ChartBuildContext(statements=[earlier, later], company=_company())

    series = build_revenue_trend(ctx)
    assert len(series) == 1
    points = series[0].points
    assert [p.value for p in points] == [340_931, 354_813]
    # Senus convention: HY starting Jul 2024 belongs to fiscal year 2025,
    # HY starting Jul 2025 belongs to fiscal year 2026.
    assert [p.fiscal_year for p in points] == [2025, 2026]


def test_revenue_card_is_the_single_most_recent_point_with_source_refs():
    ctx = ChartBuildContext(statements=_statements(HY2026_VALUES), company=_company())
    series = build_revenue_card(ctx)

    assert len(series) == 1
    assert len(series[0].points) == 1
    point = series[0].points[0]
    assert point.value == 354_813
    assert len(point.source_refs) == 1
    assert point.source_refs[0].taxonomy_code == "REVENUE"


def test_margin_breakdown_reuses_profitability_formula_and_carries_source_refs():
    ctx = ChartBuildContext(statements=_statements(HY2026_VALUES), company=_company())
    series = build_margin_breakdown(ctx)

    gross_series = next(s for s in series if s.label == "Gross Margin")
    net_series = next(s for s in series if s.label == "Net Margin")
    assert len(gross_series.points) == 1
    assert len(net_series.points) == 1
    # (354813 - 64861) / 354813 * 100
    assert round(gross_series.points[0].value, 2) == round((354_813 - 64_861) / 354_813 * 100, 2)
    assert {r.taxonomy_code for r in gross_series.points[0].source_refs} == {
        "REVENUE", "GROSS_PROFIT", "COST_OF_GOODS_SOLD",
    }


# Real Senus PLC HY2026 balance sheet figures (see
# tests/fixtures/senus_hy2026_ground_truth.json).
CREDIT_VALUES = {
    "CASH_AND_EQUIVALENTS": 735_189,
    "TOTAL_DEBT": 76_474,
    "CURRENT_ASSETS": 923_339,
    "CURRENT_LIABILITIES": 387_105,
    "CONTINGENT_CONSIDERATION": 850_000,
    "OPERATING_INCOME": -483_753,
    "DEBT_SERVICE": 1_391,
}


def test_current_ratio_both_bases_match_real_senus_figures():
    ctx = ChartBuildContext(statements=_statements(CREDIT_VALUES), company=_company())

    excl = build_current_ratio_excl_contingent_card(ctx)
    incl = build_current_ratio_incl_contingent_card(ctx)

    # 923,339 / 387,105 ≈ 2.39
    assert excl[0].points[0].value == pytest.approx(2.386, abs=0.01)
    # 923,339 / (387,105 + 850,000) ≈ 0.75
    assert incl[0].points[0].value == pytest.approx(0.746, abs=0.01)
    # Excluding the contingent consideration must never accidentally read its
    # statement anyway.
    assert "CONTINGENT_CONSIDERATION" not in {r.taxonomy_code for r in excl[0].points[0].source_refs}
    assert "CONTINGENT_CONSIDERATION" in {r.taxonomy_code for r in incl[0].points[0].source_refs}


def test_net_cash_is_cash_minus_bank_debt():
    ctx = ChartBuildContext(statements=_statements(CREDIT_VALUES), company=_company())
    series = build_net_cash_card(ctx)
    assert series[0].points[0].value == pytest.approx(735_189 - 76_474)


def test_interest_cover_is_not_meaningful_when_operating_income_negative():
    # Real Senus HY2026: OPERATING_INCOME is a loss, so interest_cover (like
    # DSCR/leverage_ratio - see test_metrics_solvency.py) must not compute a
    # nonsense negative multiple - it should simply have nothing to show.
    ctx = ChartBuildContext(statements=_statements(CREDIT_VALUES), company=_company())
    assert build_interest_cover_card(ctx) == []


def test_interest_cover_computes_for_a_profitable_period():
    values = dict(CREDIT_VALUES)
    values["OPERATING_INCOME"] = 100_000
    ctx = ChartBuildContext(statements=_statements(values), company=_company())
    series = build_interest_cover_card(ctx)
    assert series[0].points[0].value == pytest.approx(100_000 / 1_391)
