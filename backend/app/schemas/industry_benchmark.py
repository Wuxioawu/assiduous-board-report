import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.base import AppBaseModel


class IndustryBenchmarkUpsert(AppBaseModel):
    industry: str = Field(..., min_length=1, max_length=255)
    metric_key: str = Field(..., min_length=1, max_length=100)
    period_label: str = Field(..., min_length=1, max_length=50)
    benchmark_value: float
    source: str = Field(..., min_length=1, description="Citation for where this figure came from")


class IndustryBenchmarkRead(AppBaseModel):
    id: uuid.UUID
    industry: str
    metric_key: str
    period_label: str
    benchmark_value: float
    source: str
    created_by_user_id: uuid.UUID | None
    created_at: datetime
