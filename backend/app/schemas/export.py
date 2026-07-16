from datetime import date

from pydantic import Field

from app.models.enums import Audience
from app.schemas.base import AppBaseModel


class ExportRequest(AppBaseModel):
    period: date | None = None
    sections: list[Audience] = Field(..., min_length=1)
