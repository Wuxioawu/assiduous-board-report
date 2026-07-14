import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import PeriodType, StatementStatus


class FinancialStatement(UUIDPKMixin, TimestampMixin, Base):
    """A single AI- or manually-extracted financial line item, traceable to its
    source document/page/excerpt so every board-report figure can be verified."""

    __tablename__ = "financial_statement"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document.id", ondelete="SET NULL"), nullable=True
    )
    taxonomy_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    value: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    # Whether this row covers a full year, half year, or quarter - identified
    # from the source document itself during extraction (see
    # services/extraction/llm_extractor.py), not derived from period_start/
    # period_end alone, so board/credit charts never plot a full-year figure
    # next to a half-year one as if they were comparable (see
    # services/metrics/fiscal_periods.py's classify_period_type for the
    # date-span fallback used for manual entries and historical backfill).
    period_type: Mapped[PeriodType] = mapped_column(Enum(PeriodType, name="period_type"), nullable=False)
    # Set by ValidationService (see services/validation/service.py) right
    # after extraction - CONFIRMED unless this statement is one of the
    # inputs/output of a failed accounting-identity check, in which case it's
    # NEEDS_REVIEW and excluded from metrics/chart computation (see
    # FinancialStatementRepository.list_for_company's exclude_needs_review)
    # until an analyst corrects it.
    status: Mapped[StatementStatus] = mapped_column(
        Enum(StatementStatus, name="statement_status"), nullable=False, default=StatementStatus.CONFIRMED
    )
    confidence_score: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)
    source_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extracted_by: Mapped[str] = mapped_column(String(20), nullable=False, default="ai")
