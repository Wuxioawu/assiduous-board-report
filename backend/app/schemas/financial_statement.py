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


class FinancialStatementCreate(BaseModel):
    """Manually adding a line item that was never extracted at all (as opposed to
    FinancialStatementUpdate, which corrects one that already exists)."""

    taxonomy_code: str
    value: float
    currency: str = Field(min_length=3, max_length=3)
    period_start: date
    period_end: date
    source_note: str | None = Field(
        default=None,
        description='Free-text provenance, e.g. "Not disclosed in filing; estimated by [analyst] '
        'based on [reasoning]" or "Sourced from management accounts".',
    )


class FinancialStatementHistoryEntry(BaseModel):
    id: uuid.UUID
    previous_value: float
    new_value: float
    changed_by_user_id: uuid.UUID | None
    changed_at: datetime
