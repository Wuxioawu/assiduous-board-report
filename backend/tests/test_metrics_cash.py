from datetime import date

import pytest

from app.services.metrics.cash import compute_cash_metrics
from app.services.metrics.common import PeriodFinancials


def _by_key(values, *, period_start=date(2025, 1, 1), period_end=date(2025, 1, 31)):
    period = PeriodFinancials(period_start, period_end, values)
    return {r.key: r for r in compute_cash_metrics(period)}


def test_free_cash_flow_is_ebitda_minus_capex():
    results = _by_key({"EBITDA": 100_000, "CAPITAL_EXPENDITURE": 30_000})
    assert results["free_cash_flow"].value == 70_000


def test_burning_cash_computes_a_positive_runway_in_months():
    # 31-day period, operating cash flow -50,000 -> burns 50,000 over ~1.018 months.
    results = _by_key(
        {"NET_OPERATING_CASH_FLOW": -50_000, "CASH_AND_EQUIVALENTS": 155_000}
    )
    monthly_burn = 50_000 / (31 / 30.44)
    assert results["cash_runway_months"].value == pytest.approx(155_000 / monthly_burn)


def test_senus_hy2026_runway_matches_real_filing():
    # Real Senus PLC HY2026 figures: cash 735,189 / (410,291 / ~6 months) - a
    # naive "exactly 6 months" denominator gives ≈10.7, but period_length_months
    # counts the period's actual 184 inclusive calendar days (184/30.44 ≈
    # 6.045 months), giving the more precise ≈10.8 this formula actually produces.
    results = _by_key(
        {"NET_OPERATING_CASH_FLOW": -410_291, "CASH_AND_EQUIVALENTS": 735_189},
        period_start=date(2025, 7, 1),
        period_end=date(2025, 12, 31),
    )
    assert results["cash_runway_months"].value == pytest.approx(10.75, abs=0.15)


def test_operating_cash_flow_positive_company_has_no_applicable_runway():
    results = _by_key(
        {"NET_OPERATING_CASH_FLOW": 100_000, "CASH_AND_EQUIVALENTS": 500_000}
    )
    assert results["cash_runway_months"].value is None
    assert (
        results["cash_runway_months"].reason
        == "Company is operating-cash-flow positive; runway is not applicable"
    )


def test_runway_reports_missing_cash_balance_specifically():
    results = _by_key({"NET_OPERATING_CASH_FLOW": -20_000})
    assert results["cash_runway_months"].value is None
    assert results["cash_runway_months"].reason == "Cash balance not available"
    assert results["cash_runway_months"].missing_taxonomy_codes == ["CASH_AND_EQUIVALENTS"]


def test_runway_reports_missing_operating_cash_flow_when_cash_is_known():
    results = _by_key({"CASH_AND_EQUIVALENTS": 155_000})
    assert results["cash_runway_months"].value is None
    assert results["cash_runway_months"].reason == "Net operating cash flow not available to estimate the burn rate"
    assert results["cash_runway_months"].missing_taxonomy_codes == ["NET_OPERATING_CASH_FLOW"]


def test_working_capital_is_current_assets_minus_current_liabilities():
    results = _by_key({"CURRENT_ASSETS": 500_000, "CURRENT_LIABILITIES": 300_000})
    assert results["working_capital"].value == 200_000


def test_working_capital_missing_when_either_side_absent():
    results = _by_key({"CURRENT_ASSETS": 500_000})
    assert results["working_capital"].value is None
    assert results["working_capital"].missing_taxonomy_codes == ["CURRENT_LIABILITIES"]
