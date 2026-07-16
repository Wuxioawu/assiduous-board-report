import uuid
from datetime import datetime

from pydantic import ConfigDict

from app.schemas.base import AppBaseModel


class AccuracyReportRequest(AppBaseModel):
    document_id: uuid.UUID


class AccuracyMismatch(AppBaseModel):
    period_label: str
    field: str
    expected: float
    # None when the field wasn't extracted at all (present in ground truth,
    # missing from the document's current FinancialStatement rows) - distinct
    # from a wrong-but-present value.
    got: float | None
    source_excerpt: str | None
    source_page: int | None
    statement_id: uuid.UUID | None


class IdentityCheckResult(AppBaseModel):
    rule_name: str
    passed: bool
    expected: float
    actual: float
    delta: float


class AccuracyScorecard(AppBaseModel):
    fields_compared: int
    exact_matches: int
    mismatches: list[AccuracyMismatch]
    identity_checks_passed: int
    identity_checks_total: int
    identity_check_results: list[IdentityCheckResult]
    ground_truth_available: bool
    ground_truth_fixture: str | None


class AccuracyReportRead(AppBaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    pipeline_version: str
    # AccuracyReport.scorecard is a plain JSONB dict - Pydantic validates it
    # against this nested model automatically (dicts are valid input for a
    # nested BaseModel field regardless of from_attributes on the parent).
    scorecard: AccuracyScorecard
    created_at: datetime
