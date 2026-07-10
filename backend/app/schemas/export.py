from datetime import date

from pydantic import BaseModel, Field

from app.models.enums import Audience


class ExportRequest(BaseModel):
    period: date | None = None
    sections: list[Audience] = Field(..., min_length=1)
