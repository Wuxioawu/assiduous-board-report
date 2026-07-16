import uuid
from datetime import date, datetime

from pydantic import ConfigDict, Field

from app.schemas.base import AppBaseModel


class BudgetEntryIn(AppBaseModel):
    taxonomy_code: str
    value: float
    currency: str = "USD"


class BudgetSetRequest(AppBaseModel):
    period_start: date
    period_end: date
    entries: list[BudgetEntryIn] = Field(..., min_length=1)


class BudgetEntryRead(AppBaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    taxonomy_code: str
    value: float
    currency: str
    period_start: date
    period_end: date
    created_at: datetime
    updated_at: datetime


class BudgetPeriodSummary(AppBaseModel):
    period_start: date
    period_end: date
    entries: list[BudgetEntryRead]
    updated_at: datetime
