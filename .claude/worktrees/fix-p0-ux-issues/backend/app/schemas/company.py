import uuid

from pydantic import BaseModel, ConfigDict, Field


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    industry: str | None = None
    fiscal_year_end: str | None = None
    currency: str = Field(default="USD", min_length=3, max_length=3)


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    industry: str | None
    fiscal_year_end: str | None
    currency: str
