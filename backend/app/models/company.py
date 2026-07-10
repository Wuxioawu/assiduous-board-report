import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import ReportingFrequency


class Company(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "company"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fiscal_year_end: Mapped[str | None] = mapped_column(String(10), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    # Nullable: companies without a configured cadence fall back to displaying the
    # raw period_start/period_end date range (see fiscal_periods.compute_fiscal_label
    # and CompanyPeriod.fiscal_label) rather than a computed fiscal label.
    reporting_frequency: Mapped[ReportingFrequency | None] = mapped_column(
        Enum(ReportingFrequency, name="reporting_frequency"), nullable=True
    )
    # 1-12; defaults to calendar year (January) since most companies report on
    # one, but many (e.g. Senus PLC, whose periods run July-June) don't.
    fiscal_year_start_month: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Automated document-fetch (see services/extraction/auto_fetch.py): scoped to a
    # single well-structured source per the ARCHITECTURE.md roadmap note - a
    # company's own investor-relations page - not general exchange-filing scraping.
    investor_relations_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    auto_fetch_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_fetch_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Human-readable outcome of the last check ("Found 1 new document", "No new
    # documents found", or an error) - so failures are visible, never silent.
    last_fetch_result: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Company profile fields - all optional, purely descriptive (not used by the
    # extraction/metrics pipeline).
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    founded_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    headquarters_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Free text (e.g. "50-100 employees") rather than a strict enum/range type -
    # simpler for now, revisit if this needs to be queryable/filterable later.
    employee_count_range: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Public-facing URL the frontend loads (GET /api/v1/companies/{id}/logo) - mirrors
    # User.avatar_url's scheme, including the per-upload version segment for cache-busting.
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Internal filesystem/object-storage key, mirrors User.avatar_storage_path - never
    # exposed directly via the API.
    logo_storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
