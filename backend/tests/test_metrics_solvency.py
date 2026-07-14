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


def test_leverage_and_dscr_are_not_meaningful_when_ebitda_is_zero():
    results = _by_key({"EBITDA": 0, "DEBT_SERVICE": 200_000, "TOTAL_DEBT": 1_000_000})
    assert results["leverage_ratio"].value is None
    assert results["leverage_ratio"].reason == "Not meaningful — EBITDA negative"
    assert results["leverage_ratio"].not_meaningful is True
    assert results["dscr"].value is None
    assert results["dscr"].not_meaningful is True


def test_leverage_and_dscr_are_not_meaningful_for_negative_ebitda_not_a_nonsense_multiple():
    # Real Senus PLC HY2026 figures: EBITDA is a loss (-473,739). Dividing
    # TOTAL_DEBT or DEBT_SERVICE by a negative EBITDA produces a negative
    # multiple that looks like a real (even favorable-seeming) ratio but
    # means nothing - must render as "n/m", never as that raw negative number.
    results = _by_key({"EBITDA": -473_739, "DEBT_SERVICE": 1_391, "TOTAL_DEBT": 76_474})
    assert results["dscr"].value is None
    assert results["dscr"].not_meaningful is True
    assert results["dscr"].reason == "Not meaningful — EBITDA negative"
    assert results["leverage_ratio"].value is None
    assert results["leverage_ratio"].not_meaningful is True
    assert results["leverage_ratio"].reason == "Not meaningful — EBITDA negative"


def test_not_meaningful_is_false_for_ordinary_positive_results():
    results = _by_key({"EBITDA": 500_000, "DEBT_SERVICE": 200_000, "TOTAL_DEBT": 1_000_000})
    assert results["dscr"].not_meaningful is False
    assert results["leverage_ratio"].not_meaningful is False


def test_missing_single_input_names_that_exact_taxonomy_code():
    results = _by_key({"EBITDA": 500_000, "TOTAL_DEBT": 1_000_000})
    assert results["dscr"].value is None
    assert results["dscr"].reason == "DEBT_SERVICE not extracted for this period"
    assert results["dscr"].missing_taxonomy_codes == ["DEBT_SERVICE"]


def test_missing_multiple_inputs_uses_friendly_display_names():
    results = _by_key({})
    assert results["dscr"].reason == "EBITDA and Debt Service data not available for this period"
