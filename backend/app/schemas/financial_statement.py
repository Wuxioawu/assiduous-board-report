import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class FinancialStatementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    document_id: uuid.UUID | None
    taxonomy_code: str
    value: float
    currency: str
    period_start: date
    period_end: date
    confidence_score: float | None
    source_excerpt: str | None
    source_page: int | None
    extracted_by: str
    created_at: datetime
    updated_at: datetime


class FinancialStatementUpdate(BaseModel):
    value: float = Field(description="Manually corrected value; overrides the AI-extracted figure")
