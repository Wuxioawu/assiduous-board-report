import uuid
from datetime import date

from pydantic import BaseModel


class MetricValue(BaseModel):
    key: str
    label: str
    value: float
    unit: str


class MetricsResponse(BaseModel):
    company_id: uuid.UUID
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
