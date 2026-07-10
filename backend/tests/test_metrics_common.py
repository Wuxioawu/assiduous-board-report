from datetime import date

import pytest

from app.services.metrics.common import (
    PeriodFinancials,
    pct_change,
    period_length_days,
    period_length_months,
    period_offset_by_days,
    previous_period,
    safe_ratio_pct,
)


def test_pct_change_basic():
    assert pct_change(120, 100) == 20.0


def test_pct_change_uses_abs_of_old_so_a_shrinking_loss_reads_as_growth():
    # old=-50 -> new=-25: the loss shrank, which is an improvement, not a decline.
    assert pct_change(-25, -50) == 50.0


def test_pct_change_none_when_either_value_missing():
    assert pct_change(None, 100) is None
    assert pct_change(100, None) is None


def test_pct_change_none_when_old_is_zero():
    assert pct_change(100, 0) is None


def test_safe_ratio_pct_basic():
    assert safe_ratio_pct(25, 100) == 25.0


def test_safe_ratio_pct_none_when_denominator_zero_or_either_side_missing():
    assert safe_ratio_pct(25, 0) is None
    assert safe_ratio_pct(25, None) is None
    assert safe_ratio_pct(None, 100) is None


def test_period_length_days_is_inclusive_of_both_endpoints():
    period = PeriodFinancials(date(2025, 1, 1), date(2025, 1, 31), values={})
    assert period_length_days(period) == 31


def test_period_length_months_uses_the_30_44_day_convention():
    period = PeriodFinancials(date(2025, 1, 1), date(2025, 1, 31), values={})
    assert period_length_months(period) == pytest.approx(31 / 30.44)


def test_previous_period_picks_the_most_recent_period_before_current():
    current = PeriodFinancials(date(2025, 3, 1), date(2025, 3, 31), values={})
    older = PeriodFinancials(date(2025, 1, 1), date(2025, 1, 31), values={})
    closer = PeriodFinancials(date(2025, 2, 1), date(2025, 2, 28), values={})
    assert previous_period([older, closer, current], current) is closer


def test_previous_period_is_none_when_no_earlier_period_exists():
    current = PeriodFinancials(date(2025, 3, 1), date(2025, 3, 31), values={})
    assert previous_period([current], current) is None


def test_period_offset_by_days_excludes_the_current_period_itself():
    current = PeriodFinancials(date(2025, 3, 1), date(2025, 3, 31), values={})
    match = period_offset_by_days([current], current, target_gap_days=365, gap_tolerance_days=45)
    assert match is None


def test_period_offset_by_days_rejects_a_period_of_the_wrong_length():
    # ~31-day current period; only a ~365-day period exists at the target gap,
    # so it shouldn't be mistaken for a "same period last month" match.
    current = PeriodFinancials(date(2025, 3, 1), date(2025, 3, 31), values={})
    annual = PeriodFinancials(date(2024, 1, 1), date(2024, 12, 31), values={})
    match = period_offset_by_days([annual], current, target_gap_days=365, gap_tolerance_days=45)
    assert match is None


def test_period_offset_by_days_finds_same_period_last_year():
    current = PeriodFinancials(date(2025, 6, 1), date(2025, 6, 30), values={})
    prior_year = PeriodFinancials(date(2024, 6, 1), date(2024, 6, 30), values={})
    match = period_offset_by_days([prior_year], current, target_gap_days=365, gap_tolerance_days=45)
    assert match is prior_year
