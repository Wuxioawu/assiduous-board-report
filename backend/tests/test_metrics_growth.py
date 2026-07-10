from datetime import date

import pytest

from app.services.metrics.common import PeriodFinancials
from app.services.metrics.growth import compute_growth_metrics


def _by_key(results):
    return {r.key: r for r in results}


def test_yoy_and_mom_growth_computed_when_comparable_periods_exist():
    current = PeriodFinancials(
        date(2025, 6, 1), date(2025, 6, 30), {"REVENUE": 120_000, "CUSTOMER_COUNT": 150}
    )
    prior_month = PeriodFinancials(
        date(2025, 5, 1), date(2025, 5, 31), {"REVENUE": 100_000, "CUSTOMER_COUNT": 140}
    )
    prior_year = PeriodFinancials(
        date(2024, 6, 1), date(2024, 6, 30), {"REVENUE": 90_000, "CUSTOMER_COUNT": 100}
    )

    results = _by_key(compute_growth_metrics(current, [prior_month, prior_year]))

    assert results["revenue"].value == 120_000
    assert results["revenue_yoy_growth"].value == pytest.approx(33.333333, rel=1e-4)
    assert results["revenue_mom_growth"].value == pytest.approx(20.0)
    assert results["customer_count"].value == 150
    # previous_period() picks the most recent prior period regardless of length,
    # which is prior_month here (not prior_year).
    assert results["customer_count_growth"].value == pytest.approx(7.142857, rel=1e-4)


def test_missing_revenue_is_reported_with_its_taxonomy_code():
    current = PeriodFinancials(date(2025, 6, 1), date(2025, 6, 30), {"CUSTOMER_COUNT": 150})

    results = _by_key(compute_growth_metrics(current, []))

    assert results["revenue"].value is None
    assert results["revenue"].reason == "Revenue not extracted"
    assert results["revenue"].missing_taxonomy_codes == ["REVENUE"]


def test_annual_period_marks_mom_growth_not_applicable_instead_of_searching_for_a_month():
    current = PeriodFinancials(date(2025, 1, 1), date(2025, 12, 31), {"REVENUE": 800_000})

    results = _by_key(compute_growth_metrics(current, []))

    assert results["revenue_mom_growth"].value is None
    assert results["revenue_mom_growth"].reason == "MoM growth requires monthly-granularity reporting periods"


def test_no_history_reports_specific_reasons_for_each_growth_metric():
    current = PeriodFinancials(
        date(2025, 6, 1), date(2025, 6, 30), {"REVENUE": 120_000, "CUSTOMER_COUNT": 150}
    )

    results = _by_key(compute_growth_metrics(current, []))

    assert results["revenue_yoy_growth"].reason == "No prior-year period of comparable length found"
    assert results["revenue_mom_growth"].reason == "No prior-month period found"
    assert results["customer_count_growth"].reason == "No preceding period available for comparison"
