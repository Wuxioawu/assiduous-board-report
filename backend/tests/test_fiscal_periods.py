from datetime import date

from app.models.enums import PeriodType, ReportingFrequency
from app.services.metrics.fiscal_periods import (
    classify_period_type,
    compute_fiscal_label,
    fiscal_quarter_of,
    fiscal_year_of,
)


def test_returns_none_when_reporting_frequency_is_not_configured():
    label = compute_fiscal_label(
        date(2025, 6, 1), date(2025, 6, 30), reporting_frequency=None, fiscal_year_start_month=1
    )
    assert label is None


def test_calendar_year_company_labels_by_the_calendar_year():
    label = compute_fiscal_label(
        date(2025, 3, 1),
        date(2025, 3, 31),
        reporting_frequency=ReportingFrequency.ANNUAL,
        fiscal_year_start_month=1,
    )
    assert label == "FY2025"


def test_non_january_fiscal_year_is_named_by_the_year_it_ends_in():
    # Senus PLC convention: a fiscal year starting July 2025 and ending June 2026
    # is "FY2026", not "FY2025".
    label = compute_fiscal_label(
        date(2025, 7, 1),
        date(2025, 9, 30),
        reporting_frequency=ReportingFrequency.ANNUAL,
        fiscal_year_start_month=7,
    )
    assert label == "FY2026"


def test_half_yearly_labels_first_and_second_half_of_a_non_calendar_fiscal_year():
    fy_start_month = 7
    h1 = compute_fiscal_label(
        date(2025, 7, 1),
        date(2025, 12, 31),
        reporting_frequency=ReportingFrequency.HALF_YEARLY,
        fiscal_year_start_month=fy_start_month,
    )
    h2 = compute_fiscal_label(
        date(2026, 1, 1),
        date(2026, 6, 30),
        reporting_frequency=ReportingFrequency.HALF_YEARLY,
        fiscal_year_start_month=fy_start_month,
    )
    assert h1 == "FY2026 H1"
    assert h2 == "FY2026 H2"


def test_quarterly_labels_progress_through_a_non_calendar_fiscal_year():
    fy_start_month = 7
    labels = [
        compute_fiscal_label(
            date(2025, month, 1),
            date(2025, month, 28),
            reporting_frequency=ReportingFrequency.QUARTERLY,
            fiscal_year_start_month=fy_start_month,
        )
        for month in (7, 10)
    ]
    assert labels == ["FY2026 Q1", "FY2026 Q2"]


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
