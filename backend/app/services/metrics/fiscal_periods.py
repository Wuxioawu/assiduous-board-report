from datetime import date

from app.models.enums import PeriodType, ReportingFrequency

# Day-count bands for classifying a period's span as a quarter, half-year, or
# full year from its dates alone. Bounds are generous (not exactly 91/182/365)
# to tolerate real-world reporting variance (a "quarter" can run 89-92 days,
# a fiscal year with a short stub period, etc.) while keeping the three bands
# non-overlapping.
_QUARTER_MAX_DAYS = 100
_HALF_YEAR_MAX_DAYS = 200


def fiscal_year_of(period_start: date, *, fiscal_year_start_month: int) -> int:
    """The fiscal year a period belongs to, named by the calendar year in which
    that fiscal year ENDS - a fiscal year starting July 2025 and ending June
    2026 is "2026", following the same convention Senus PLC itself uses (its
    FY2026 runs July 2025-June 2026). For a calendar-year company
    (fiscal_year_start_month=1) this is just period_start's year, since the
    fiscal year never crosses into the next one.

    Determined from period_start alone, which works for a period of any
    length (FY, HY, or Q) starting anywhere within that fiscal year - not just
    a period_start that lands exactly on the fiscal year boundary.
    """
    # The fiscal year only spills into the next calendar year if it starts
    # after January and period_start falls in that first, "wrapping" portion
    # (e.g. July-Dec for a July-start FY) - a January-start FY never wraps.
    wraps_to_next_year = fiscal_year_start_month > 1 and period_start.month >= fiscal_year_start_month
    return period_start.year + (1 if wraps_to_next_year else 0)


def fiscal_quarter_of(period_start: date, *, fiscal_year_start_month: int) -> int:
    """1-4 index of the fiscal quarter period_start falls in, within its fiscal year."""
    months_into_fy = (period_start.month - fiscal_year_start_month) % 12
    return months_into_fy // 3 + 1


def classify_period_type(period_start: date, period_end: date) -> PeriodType:
    """Best-effort FY/HY/Q classification purely from a period's date span.

    FinancialStatement.period_type should normally come from the document
    itself (extraction asks the LLM to identify it directly, e.g. from
    "Half Year Results for the 6 months ended..." wording, which is more
    reliable than date math for edge cases like a short stub period). This is
    the fallback/sanity-check for that, and is also what backfills historical
    rows that predate the period_type column - see the
    add_period_type_to_financial_statement migration, which mirrors these
    same thresholds in raw SQL so a backfilled row and a freshly-validated one
    are classified identically.
    """
    span_days = (period_end - period_start).days
    if span_days <= _QUARTER_MAX_DAYS:
        return PeriodType.Q
    if span_days <= _HALF_YEAR_MAX_DAYS:
        return PeriodType.HY
    return PeriodType.FY


def compute_fiscal_label(
    period_start: date,
    period_end: date,
    *,
    reporting_frequency: ReportingFrequency | None,
    fiscal_year_start_month: int,
) -> str | None:
    """Fiscal-year-aware label for a reporting period (e.g. "FY2026 H1"), given a
    company's configured cadence and fiscal year start month.

    Returns None when reporting_frequency isn't configured - callers should fall
    back to displaying the raw period_start/period_end range in that case (see
    CompanyPeriod.fiscal_label), rather than forcing a fiscal label onto a
    company that hasn't set one up.
    """
    if reporting_frequency is None:
        return None

    fiscal_year = fiscal_year_of(period_start, fiscal_year_start_month=fiscal_year_start_month)
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
