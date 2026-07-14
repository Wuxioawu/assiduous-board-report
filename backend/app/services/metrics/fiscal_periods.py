from datetime import date
from typing import Literal

from app.models.enums import PeriodType

# Day-count bands for classifying a period's span as a quarter, half-year, or
# full year from its dates alone. Bounds are generous (not exactly 91/182/365)
# to tolerate real-world reporting variance (a "quarter" can run 89-92 days,
# a fiscal year with a short stub period, etc.) while keeping the three bands
# non-overlapping.
_QUARTER_MAX_DAYS = 100
_HALF_YEAR_MAX_DAYS = 200

_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


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


def format_period_label(
    *,
    period_type: PeriodType,
    period_end: date,
    fiscal_year: int,
    fiscal_quarter: int | None = None,
    mode: Literal["compact", "full"] = "full",
) -> str:
    """The backend's single source of truth for how a period renders as text -
    mirrors frontend lib/periods.ts's formatPeriodLabel field-for-field (same
    canonical text, same compact/full split) so the PDF export (the one
    period-label surface that can't call into the frontend) never drifts from
    what the dropdown/header/charts show for the same period. Callers get
    period_type/fiscal_year/fiscal_quarter the same way routes/metrics.py and
    routes/companies.py already do: classify_period_type + fiscal_year_of +
    fiscal_quarter_of.
    """
    month = _MONTH_ABBR[period_end.month - 1]
    if period_type == PeriodType.HY:
        main, secondary = f"HY{fiscal_year}", f"(6M to {month} {period_end.year})"
    elif period_type == PeriodType.FY:
        main, secondary = f"FY{fiscal_year}", f"(12M to {month} {period_end.year})"
    else:
        quarter = fiscal_quarter if fiscal_quarter is not None else "?"
        main, secondary = f"Q{quarter} FY{fiscal_year}", f"(3M to {month} {period_end.year})"
    return main if mode == "compact" else f"{main} {secondary}"
