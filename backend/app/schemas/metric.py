import uuid
from datetime import date

from pydantic import BaseModel


class MetricValue(BaseModel):
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


class MetricsResponse(BaseModel):
    company_id: uuid.UUID
    currency: str
    period_start: date | None
    period_end: date | None
    growth: list[MetricValue]
    profitability: list[MetricValue]
    cash: list[MetricValue]
    solvency: list[MetricValue]
    returns: list[MetricValue]


class MetricHistoryPoint(BaseModel):
    period_start: date
    period_end: date
    value: float


class MetricHistoryResponse(BaseModel):
    company_id: uuid.UUID
    series: dict[str, list[MetricHistoryPoint]]
