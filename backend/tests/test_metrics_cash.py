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
    # 31-day period, EBITDA - CapEx = -50,000 -> burns 50,000 over ~1.018 months.
    results = _by_key(
        {"EBITDA": -20_000, "CAPITAL_EXPENDITURE": 30_000, "CASH_AND_EQUIVALENTS": 155_000}
    )
    monthly_burn = 50_000 / (31 / 30.44)
    assert results["cash_runway_months"].value == pytest.approx(155_000 / monthly_burn)


def test_fcf_positive_company_has_no_applicable_runway():
    results = _by_key(
        {"EBITDA": 100_000, "CAPITAL_EXPENDITURE": 30_000, "CASH_AND_EQUIVALENTS": 500_000}
    )
    assert results["cash_runway_months"].value is None
    assert results["cash_runway_months"].reason == "Company is free-cash-flow positive; runway is not applicable"


def test_runway_reports_missing_cash_balance_specifically():
    results = _by_key({"EBITDA": -20_000, "CAPITAL_EXPENDITURE": 30_000})
    assert results["cash_runway_months"].value is None
    assert results["cash_runway_months"].reason == "Cash balance not available"
    assert results["cash_runway_months"].missing_taxonomy_codes == ["CASH_AND_EQUIVALENTS"]


def test_runway_reports_missing_fcf_inputs_when_cash_is_known():
    results = _by_key({"CASH_AND_EQUIVALENTS": 155_000, "CAPITAL_EXPENDITURE": 30_000})
    assert results["cash_runway_months"].value is None
    assert results["cash_runway_months"].reason == "Free cash flow not available to estimate the burn rate"
    assert results["cash_runway_months"].missing_taxonomy_codes == ["EBITDA"]


def test_working_capital_is_current_assets_minus_current_liabilities():
    results = _by_key({"CURRENT_ASSETS": 500_000, "CURRENT_LIABILITIES": 300_000})
    assert results["working_capital"].value == 200_000


def test_working_capital_missing_when_either_side_absent():
    results = _by_key({"CURRENT_ASSETS": 500_000})
    assert results["working_capital"].value is None
    assert results["working_capital"].missing_taxonomy_codes == ["CURRENT_LIABILITIES"]
