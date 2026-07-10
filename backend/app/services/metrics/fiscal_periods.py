from datetime import date

from app.models.enums import ReportingFrequency


def compute_fiscal_label(
    period_start: date,
    period_end: date,
    *,
    reporting_frequency: ReportingFrequency | None,
    fiscal_year_start_month: int,
) -> str | None:
    """Fiscal-year-aware label for a reporting period (e.g. "FY2026 H1"), given a
    company's configured cadence and fiscal year start month.

    Convention: a fiscal year is named by the calendar year in which it ENDS - a
    fiscal year starting July 2025 and ending June 2026 is "FY2026", following
    the same convention Senus PLC itself uses (its FY2026 runs July 2025-June
    2026). For a calendar-year company (fiscal_year_start_month=1) this is just
    the year itself, since the fiscal year never crosses into the next one.

    Returns None when reporting_frequency isn't configured - callers should fall
    back to displaying the raw period_start/period_end range in that case (see
    CompanyPeriod.fiscal_label), rather than forcing a fiscal label onto a
    company that hasn't set one up.
    """
    if reporting_frequency is None:
        return None

    # The fiscal year only spills into the next calendar year if it starts
    # after January and period_start falls in that first, "wrapping" portion
    # (e.g. July-Dec for a July-start FY) - a January-start FY never wraps.
    wraps_to_next_year = fiscal_year_start_month > 1 and period_start.month >= fiscal_year_start_month
    fiscal_year = period_start.year + (1 if wraps_to_next_year else 0)

    months_into_fy = (period_start.month - fiscal_year_start_month) % 12

    if reporting_frequency == ReportingFrequency.ANNUAL:
        return f"FY{fiscal_year}"
    if reporting_frequency == ReportingFrequency.HALF_YEARLY:
        half_index = months_into_fy // 6 + 1
        return f"FY{fiscal_year} H{half_index}"
    if reporting_frequency == ReportingFrequency.QUARTERLY:
        quarter_index = months_into_fy // 3 + 1
        return f"FY{fiscal_year} Q{quarter_index}"
    return None
