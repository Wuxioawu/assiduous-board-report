import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPKMixin


class AccuracyReport(UUIDPKMixin, CreatedAtMixin, Base):
    """A single scorecard run for one document (see services/accuracy_report.py) -
    compares the document's currently-extracted FinancialStatement values against
    hand-verified ground truth (tests/fixtures/*_ground_truth.json, when one exists
    for this document) and against the accounting-identity checks already recorded
    for it (see ValidationResult), so extraction precision is something an admin can
    see and prove rather than just trust. Immutable once created - a fresh run
    (e.g. after Re-extract) creates a new row rather than updating this one, so the
    "latest scorecard" the frontend shows is always the most recent row for a
    document, and history isn't lost."""

    __tablename__ = "accuracy_report"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("document.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Manually bumped constant identifying the extraction prompt/schema version
    # this report ran against (see services/extraction/llm_extractor.py's
    # EXTRACTION_PIPELINE_VERSION) - lets a mismatch spike be correlated with a
    # specific prompt change rather than looking like unexplained noise.
    pipeline_version: Mapped[str] = mapped_column(String(50), nullable=False)
    # {fields_compared, exact_matches, mismatches: [{period_label, field, expected,
    # got, source_excerpt, source_page, statement_id}], identity_checks_passed,
    # identity_checks_total, identity_check_results: [{rule_name, passed, expected,
    # actual, delta}], ground_truth_available, ground_truth_fixture} - see
    # services/accuracy_report.py for the exact shape this is always written with.
    scorecard: Mapped[dict] = mapped_column(JSONB, nullable=False)
