import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class BudgetEntryIn(BaseModel):
    taxonomy_code: str
    value: float
    currency: str = "USD"


class BudgetSetRequest(BaseModel):
    period_start: date
    period_end: date
    entries: list[BudgetEntryIn] = Field(..., min_length=1)


class BudgetEntryRead(BaseModel):
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


class BudgetPeriodSummary(BaseModel):
    period_start: date
    period_end: date
    entries: list[BudgetEntryRead]
    updated_at: datetime
