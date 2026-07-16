import uuid
from datetime import date

from app.models.enums import PeriodType
from app.schemas.base import AppBaseModel


class MetricValue(AppBaseModel):
    key: str
    label: str
    # Null when the metric couldn't be computed for this period (missing
    # underlying FinancialStatement data) - `reason` explains why rather than
    # the card just showing an unexplained blank state (see
    # app/services/metrics/*.py's MetricResult.reason and orchestrator.py).
    value: float | None
    reason: str | None = None
    # Exact taxonomy code(s) responsible for `value` being null, when the gap traces to
    # specific missing line item(s) (see MetricResult.missing_taxonomy_codes) - lets the
    # frontend deep-link straight to "add this missing line item" pre-filled. Absent when
    # the metric has a value, or is missing for a non-taxonomy reason.
    missing_taxonomy_codes: list[str] | None = None
    # True for a ratio whose inputs are all present but the result isn't
    # meaningful to show as a number (see MetricResult.not_meaningful) - the
    # frontend renders "n/m" instead of "—" for this case, with `reason`
    # still driving the tooltip.
    not_meaningful: bool = False
    unit: str
    # Present only when a Budget entry exists for this metric's taxonomy code and
    # period (see api/v1/routes/metrics.py); absent otherwise so companies/periods
    # with no budget set are unaffected.
    budget_value: float | None = None
    variance: float | None = None
    variance_pct: float | None = None
    higher_is_better: bool | None = None
    # Present only when the company has an industry set and a manually-curated
    # IndustryBenchmark entry exists for that industry/metric; absent otherwise
    # (see api/v1/routes/metrics.py and models/industry_benchmark.py).
    benchmark_value: float | None = None
    vs_benchmark_pct: float | None = None
    benchmark_source: str | None = None
    benchmark_period_label: str | None = None


class MetricsResponse(AppBaseModel):
    company_id: uuid.UUID
    currency: str
    period_start: date | None
    period_end: date | None
    # Same derivation as MetricHistoryPoint's (see below) for this response's
    # single current period - None exactly when period_start/period_end are
    # None (no computed metrics for this company yet). Lets a metric card or
    # the Cash Flow Bridge caption its period via lib/periods.formatPeriodLabel
    # instead of a hardcoded "FY{year}".
    period_type: PeriodType | None = None
    fiscal_year: int | None = None
    fiscal_quarter: int | None = None
    growth: list[MetricValue]
    profitability: list[MetricValue]
    cash: list[MetricValue]
    solvency: list[MetricValue]
    returns: list[MetricValue]


class MetricHistoryPoint(AppBaseModel):
    period_start: date
    period_end: date
    # Derived server-side (see api/v1/routes/metrics.py) from whichever
    # FinancialStatement rows fed this period's Metric computation, and the
    # company's fiscal_year_start_month - not stored on Metric itself, since
    # it's fully determined by that lookup and doesn't need its own column/
    # migration. Lets the frontend build a correct "HY2026"/"FY2025"/
    # "Q2 FY2026" label (see lib/periods.formatPeriodLabel) without needing
    # fiscal-year math of its own, and lets it group/filter a trend line by
    # period_type so a full-year point is never plotted next to a half-year
    # one as if they were comparable (see ReportView's period-type toggle).
    period_type: PeriodType
    fiscal_year: int
    # Only meaningful when period_type is "Q" - the 1-4 quarter index within
    # fiscal_year. None for FY/HY points.
    fiscal_quarter: int | None = None
    value: float


class MetricHistoryResponse(AppBaseModel):
    company_id: uuid.UUID
    series: dict[str, list[MetricHistoryPoint]]
