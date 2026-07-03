import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import DocumentStatus


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    filename: str
    file_type: str
    status: DocumentStatus
    period_start: date | None
    period_end: date | None
    error_message: str | None
    created_at: datetime
