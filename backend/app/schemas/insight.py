import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import InsightSeverity


class InsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    audience: str
    period_start: date
    period_end: date
    insight_type: str
    title: str
    body: str
    severity: InsightSeverity
    created_at: datetime
