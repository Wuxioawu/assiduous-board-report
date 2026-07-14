import uuid

from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class ValidationResult(UUIDPKMixin, TimestampMixin, Base):
    """One accounting-identity rule's outcome for one FinancialStatement row
    (see services/validation/service.py) - e.g. "does GROSS_PROFIT equal
    REVENUE minus COST_OF_GOODS_SOLD for this statement's period". A single
    statement can have several rows here (one per rule it's involved in);
    statement_id is the rule's "primary" statement (see
    services/validation/rules.py's ValidationRule.primary_code) rather than
    every statement the rule reads, since a rule reads multiple taxonomy
    codes but produces one pass/fail outcome about a specific figure."""

    __tablename__ = "validation_result"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    statement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("financial_statement.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    expected_value: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    actual_value: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    # actual_value - expected_value, stored rather than left for callers to
    # recompute since it's the number an analyst actually wants to see first
    # when triaging a needs_review statement ("how far off is it").
    delta: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
