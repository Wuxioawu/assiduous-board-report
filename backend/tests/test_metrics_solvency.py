from datetime import date

import pytest

from app.services.metrics.common import PeriodFinancials
from app.services.metrics.solvency import compute_solvency_metrics


def _by_key(values):
    period = PeriodFinancials(date(2025, 1, 1), date(2025, 12, 31), values)
    return {r.key: r for r in compute_solvency_metrics(period)}


def test_dscr_and_leverage_computed_when_all_inputs_present():
    results = _by_key({"EBITDA": 500_000, "DEBT_SERVICE": 200_000, "TOTAL_DEBT": 1_000_000})
    assert results["dscr"].value == pytest.approx(2.5)
    assert results["leverage_ratio"].value == pytest.approx(2.0)


def test_dscr_flags_zero_debt_service_instead_of_dividing_by_zero():
    results = _by_key({"EBITDA": 500_000, "DEBT_SERVICE": 0, "TOTAL_DEBT": 1_000_000})
    assert results["dscr"].value is None
    assert results["dscr"].reason == "Debt service is zero for this period"
    assert results["dscr"].missing_taxonomy_codes is None


def test_leverage_flags_zero_ebitda_instead_of_dividing_by_zero():
    results = _by_key({"EBITDA": 0, "DEBT_SERVICE": 200_000, "TOTAL_DEBT": 1_000_000})
    assert results["leverage_ratio"].value is None
    assert results["leverage_ratio"].reason == "EBITDA is zero for this period"


def test_missing_single_input_names_that_exact_taxonomy_code():
    results = _by_key({"EBITDA": 500_000, "TOTAL_DEBT": 1_000_000})
    assert results["dscr"].value is None
    assert results["dscr"].reason == "DEBT_SERVICE not extracted for this period"
    assert results["dscr"].missing_taxonomy_codes == ["DEBT_SERVICE"]


def test_missing_multiple_inputs_uses_friendly_display_names():
    results = _by_key({})
    assert results["dscr"].reason == "EBITDA and Debt Service data not available for this period"
