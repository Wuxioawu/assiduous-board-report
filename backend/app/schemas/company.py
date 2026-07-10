import re
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import ReportingFrequency

_URL_PATTERN = re.compile(r"^https?://[^\s/$.?#][^\s]*$", re.IGNORECASE)

_BLANK_TO_NONE_FIELDS = (
    "description",
    "founded_date",
    "website_url",
    "headquarters_location",
    "employee_count_range",
)


class CompanyProfileFields(BaseModel):
    """Optional descriptive profile fields shared by create and update - kept in
    one place so the validation rules can't drift between the two."""

    description: str | None = None
    founded_date: date | None = None
    website_url: str | None = Field(default=None, max_length=2000)
    headquarters_location: str | None = Field(default=None, max_length=255)
    employee_count_range: str | None = Field(default=None, max_length=100)

    @field_validator(*_BLANK_TO_NONE_FIELDS, mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        # A cleared form field arrives as "" rather than omitted/null - treat it
        # the same as "not set" instead of failing date parsing or persisting an
        # empty string.
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator("website_url")
    @classmethod
    def validate_website_url(cls, value: str | None) -> str | None:
        if value is not None and not _URL_PATTERN.match(value):
            raise ValueError("website_url must be a valid http(s) URL, e.g. https://example.com")
        return value

    @field_validator("founded_date")
    @classmethod
    def validate_founded_date(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("founded_date cannot be in the future")
        return value


class CompanyCreate(CompanyProfileFields):
    name: str = Field(min_length=1, max_length=255)
    industry: str | None = None
    fiscal_year_end: str | None = None
    currency: str = Field(default="USD", min_length=3, max_length=3)
    reporting_frequency: ReportingFrequency | None = None
    # Defaults to calendar year (January), matching the Company model's column
    # default - most companies report on one, but this stays configurable for
    # those that don't (e.g. Senus PLC's Jul-Jun fiscal year).
    fiscal_year_start_month: int = Field(default=1, ge=1, le=12)


class CompanyUpdate(CompanyProfileFields):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    industry: str | None = None
    investor_relations_url: str | None = Field(default=None, max_length=2000)
    auto_fetch_enabled: bool | None = None
    reporting_frequency: ReportingFrequency | None = None
    fiscal_year_start_month: int | None = Field(default=None, ge=1, le=12)


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    industry: str | None
    fiscal_year_end: str | None
    currency: str
    reporting_frequency: ReportingFrequency | None
    fiscal_year_start_month: int
    investor_relations_url: str | None
    auto_fetch_enabled: bool
    last_fetch_checked_at: datetime | None
    last_fetch_result: str | None
    description: str | None
    founded_date: date | None
    website_url: str | None
    headquarters_location: str | None
    employee_count_range: str | None
    logo_url: str | None


class CompanyLogoResponse(BaseModel):
    logo_url: str | None


class CompanyPeriod(BaseModel):
    period_start: date
    period_end: date
    # Computed from the company's reporting_frequency/fiscal_year_start_month
    # (see services/metrics/fiscal_periods.py) - None when the company hasn't
    # configured a reporting cadence, in which case the frontend falls back to
    # displaying the raw period_start/period_end range as it always has.
    fiscal_label: str | None = None


class CompanyFetchResult(BaseModel):
    found_new: int
    message: str
    last_fetch_checked_at: datetime | None
    # Echoes the company's current auto_fetch_enabled state so the caller can
    # immediately reflect it (e.g. the circuit breaker in auto_fetch.py can
    # turn this off mid-check) without a separate re-fetch of the company.
    auto_fetch_enabled: bool
