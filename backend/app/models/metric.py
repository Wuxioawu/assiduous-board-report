import uuid
from datetime import date

from sqlalchemy import ARRAY, Boolean, Date, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPKMixin


class Metric(UUIDPKMixin, CreatedAtMixin, Base):
    __tablename__ = "metric"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True
    )
    financial_statement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("financial_statement.id", ondelete="SET NULL"), nullable=True
    )
    metric_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    metric_label: Mapped[str] = mapped_column(String(255), nullable=False)
    # Nullable: a metric that couldn't be computed (missing underlying
    # FinancialStatement data) is still persisted, with `reason` explaining
    # why - rather than the row simply not existing - so the dashboard can
    # tell "not enough data" apart from "never checked" (see orchestrator.py
    # and app/services/metrics/*.py's MetricResult.reason).
    value: Mapped[float | None] = mapped_column(Numeric(20, 4), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Exact taxonomy code(s) whose absence is why `value`/`reason` indicate a gap - lets
    # the frontend deep-link straight to "add this missing line item" (see
    # app/services/metrics/*.py's MetricResult.missing_taxonomy_codes). Null both when
    # value is present and when it's missing for a non-taxonomy reason (e.g. no
    # prior-year period to compare against).
    missing_taxonomy_codes: Mapped[list[str] | None] = mapped_column(ARRAY(String(100)), nullable=True)
    # True for a ratio whose inputs are all present but the result is
    # mathematically nonsensical to show as a plain number - e.g. DSCR/
    # leverage_ratio divided by a negative-or-zero EBITDA (see
    # services/metrics/solvency.py). Distinct from value=None+reason (that
    # means the data is missing; this means the data is present but the
    # ratio itself isn't meaningful) - the frontend renders "n/m" instead of
    # "—" for this case.
    not_meaningful: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
