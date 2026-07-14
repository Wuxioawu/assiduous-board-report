from datetime import date

from app.models.enums import PeriodType
from app.services.metrics.fiscal_periods import (
    classify_period_type,
    fiscal_quarter_of,
    fiscal_year_of,
    format_period_label,
)


def test_classify_period_type_from_date_span():
    assert classify_period_type(date(2025, 1, 1), date(2025, 3, 31)) == PeriodType.Q
    assert classify_period_type(date(2025, 7, 1), date(2025, 12, 31)) == PeriodType.HY
    assert classify_period_type(date(2024, 7, 1), date(2025, 6, 30)) == PeriodType.FY


def test_fiscal_year_of_matches_senus_hy_and_fy_convention():
    # Senus PLC: FY ends 30 June, so a fiscal year starting July 2025 is FY2026.
    # The two comparative half-year periods reported alongside the FY2025
    # annual figures resolve to different fiscal years despite both being HY,
    # since one starts in FY2025 and the other in FY2026.
    assert fiscal_year_of(date(2024, 7, 1), fiscal_year_start_month=7) == 2025  # HY2025 / FY2025
    assert fiscal_year_of(date(2025, 7, 1), fiscal_year_start_month=7) == 2026  # HY2026
    assert fiscal_year_of(date(2025, 3, 1), fiscal_year_start_month=1) == 2025  # calendar-year company


def test_fiscal_quarter_of_progresses_through_a_non_calendar_fiscal_year():
    assert fiscal_quarter_of(date(2025, 7, 1), fiscal_year_start_month=7) == 1
    assert fiscal_quarter_of(date(2025, 10, 1), fiscal_year_start_month=7) == 2
    assert fiscal_quarter_of(date(2026, 1, 1), fiscal_year_start_month=7) == 3
    assert fiscal_quarter_of(date(2026, 4, 1), fiscal_year_start_month=7) == 4


def test_format_period_label_half_year_full_and_compact():
    label = format_period_label(period_type=PeriodType.HY, period_end=date(2025, 12, 31), fiscal_year=2026)
    assert label == "HY2026 (6M to Dec 2025)"
    compact = format_period_label(
        period_type=PeriodType.HY, period_end=date(2025, 12, 31), fiscal_year=2026, mode="compact"
    )
    assert compact == "HY2026"


def test_format_period_label_full_year():
    label = format_period_label(period_type=PeriodType.FY, period_end=date(2025, 6, 30), fiscal_year=2025)
    assert label == "FY2025 (12M to Jun 2025)"


def test_format_period_label_quarter_includes_quarter_index():
    label = format_period_label(
        period_type=PeriodType.Q, period_end=date(2025, 12, 31), fiscal_year=2026, fiscal_quarter=2
    )
    assert label == "Q2 FY2026 (3M to Dec 2025)"


def test_format_period_label_quarter_without_index_falls_back_to_placeholder():
    label = format_period_label(period_type=PeriodType.Q, period_end=date(2025, 12, 31), fiscal_year=2026)
    assert label == "Q? FY2026 (3M to Dec 2025)"
