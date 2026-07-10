import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPKMixin
from app.models.enums import InsightSeverity


class Insight(UUIDPKMixin, CreatedAtMixin, Base):
    __tablename__ = "insight"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True
    )
    audience: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    insight_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # Legacy freeform fields - still populated on every new insight (title gets the
    # headline, body gets a synthesized plain-text digest of the structured content)
    # so anything reading only these two columns keeps working untouched, and
    # pre-migration rows that only ever had these two fields render fine too.
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Structured {headline, sections[{label, summary, key_stats[], detail}],
    # watch_items[]} payload - the frontend prefers this when present and only
    # falls back to title/body for rows generated before this field existed.
    structured_content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Human edit of the structured content, same shape as structured_content - kept
    # entirely separate from the AI-generated fields above so the original AI output
    # is never overwritten and can always be inspected or reverted to (same
    # provenance-transparency principle as manually-overridden financial statements).
    edited_content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    edited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    severity: Mapped[InsightSeverity] = mapped_column(
        Enum(InsightSeverity, name="insight_severity"),
        nullable=False,
        default=InsightSeverity.INFO,
    )
    source_metric_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
