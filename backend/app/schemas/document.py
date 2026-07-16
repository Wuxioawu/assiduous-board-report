import uuid
from datetime import date, datetime

from pydantic import ConfigDict

from app.models.enums import DocumentStatus
from app.schemas.base import AppBaseModel


class DocumentRead(AppBaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    filename: str
    file_type: str
    status: DocumentStatus
    period_start: date | None
    period_end: date | None
    error_message: str | None
    source_type: str
    created_at: datetime
