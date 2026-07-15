import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import FIXTURES_DIR
from app.models.accuracy_report import AccuracyReport
from app.models.document import Document
from app.models.enums import DocumentStatus
from app.models.validation_result import ValidationResult
from app.repositories.financial_statement import FinancialStatementRepository
from app.services.extraction.llm_extractor import EXTRACTION_PIPELINE_VERSION
from app.services.validation.rules import TOLERANCE, VALIDATION_RULES

# Only these rules count as "accounting identities" for the scorecard -
# excludes ValidationService's revenue_scale_sanity_check, which is a
# plausibility/outlier heuristic on a single figure, not a relationship
# between line items, so folding it in here would make "identities" a
# misnomer and inflate the total beyond what VALIDATION_RULES actually
# defines as an identity.
_IDENTITY_RULE_NAMES = {rule.name for rule in VALIDATION_RULES}


class MalformedGroundTruthFixtureError(ValueError):
    """A fixture matched a document by filename but doesn't have the shape
    build_accuracy_report needs to walk it (see _validate_fixture_shape) -
    distinct from "no fixture exists for this document" (find_ground_truth_
    for_document returning None), which is the normal identities-only case,
    not an error. A matched-but-broken fixture is a real, fixable problem
    (someone hand-edited it and typo'd a key, or fed it a different shape
    entirely) and should surface loudly to an admin - see routes/companies.py,
    which turns this into a 422 with the message as its detail - rather than
    either crashing with an opaque KeyError or silently downgrading to
    identities-only as if the fixture had never existed."""


class ExtractionNotCompleteError(ValueError):
    """Raised when an accuracy report is requested for a document that hasn't
    finished extraction (or failed it) - see routes/companies.py, which turns
    this into a 409 rather than generating a misleading near-empty scorecard
    against data that was never fully extracted in the first place."""


def _load_ground_truth_fixtures() -> list[dict]:
    if not FIXTURES_DIR.is_dir():
        return []
    fixtures = []
    for path in sorted(FIXTURES_DIR.glob("*_ground_truth.json")):
        try:
            fixtures.append(json.loads(path.read_text()))
        except (json.JSONDecodeError, OSError):
            continue
    return fixtures


def find_ground_truth_for_document(filename: str) -> dict | None:
    """Matches a Document's filename against each fixture's own
    document_filename field (see tests/fixtures/*_ground_truth.json) - exact
    match, since a fixture is hand-verified against one specific PDF and
    isn't meant to loosely apply to a similarly-named one. A missing fixtures
    directory, or no fixture matching this filename, both just return None -
    a normal case (see build_accuracy_report's identities-only mode), not an
    error."""
    for fixture in _load_ground_truth_fixtures():
        if fixture.get("document_filename") == filename:
            return fixture
    return None


def _validate_fixture_shape(fixture: dict) -> None:
    """A fixture that matched by filename still might not be walkable - a
    hand-edit that renames/removes a key, or an entirely different shape,
    would otherwise surface as an opaque KeyError/TypeError deep in
    build_accuracy_report's comparison loop. Checked once, up front, so every
    failure names the exact missing/wrong-shaped key instead."""
    periods = fixture.get("periods")
    if not isinstance(periods, dict):
        raise MalformedGroundTruthFixtureError("Ground-truth fixture malformed: missing key 'periods'")
    for period_label, period in periods.items():
        if not isinstance(period, dict):
            raise MalformedGroundTruthFixtureError(
                f"Ground-truth fixture malformed: 'periods.{period_label}' is not an object"
            )
        for required_key in ("period_type", "period_end", "line_items"):
            if required_key not in period:
                raise MalformedGroundTruthFixtureError(
                    f"Ground-truth fixture malformed: missing key 'periods.{period_label}.{required_key}'"
                )
        if not isinstance(period["line_items"], dict):
            raise MalformedGroundTruthFixtureError(
                f"Ground-truth fixture malformed: 'periods.{period_label}.line_items' is not an object"
            )


def _empty_scorecard() -> dict:
    return {
        "fields_compared": 0,
        "exact_matches": 0,
        "mismatches": [],
        "identity_checks_passed": 0,
        "identity_checks_total": 0,
        "identity_check_results": [],
        "ground_truth_available": False,
        "ground_truth_fixture": None,
    }


async def build_accuracy_report(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    company_id: uuid.UUID,
    document: Document,
) -> AccuracyReport:
    """Scores the document's CURRENT extraction output (whatever's in
    FinancialStatement right now, not a fresh LLM call) against hand-verified
    ground truth, when a fixture exists for it, and against the accounting-
    identity checks already recorded for it - always, regardless of whether a
    fixture exists. Read-only over FinancialStatement/ValidationResult: this
    never re-runs extraction or validation, it just reports on what's already
    there (see services/extraction/pipeline.run_extraction, which is what
    actually produces/validates the data this reads).

    Raises ExtractionNotCompleteError if the document hasn't finished
    extraction, and MalformedGroundTruthFixtureError if a fixture matched by
    filename doesn't have the expected shape - both caught in
    routes/companies.py and turned into a specific HTTP status with a
    self-explanatory detail message rather than a bare 500."""
    if document.status != DocumentStatus.EXTRACTED:
        if document.status == DocumentStatus.FAILED:
            detail = f"Extraction failed for this document: {document.error_message or 'unknown error'}"
        else:
            detail = f"Extraction not complete for this document (status: {document.status.value})"
        raise ExtractionNotCompleteError(detail)

    statements = await FinancialStatementRepository(db).list_for_document(
        document_id=document.id, organization_id=organization_id
    )
    scorecard = _empty_scorecard()

    # --- ground-truth comparison (every period the fixture covers) ---
    ground_truth = find_ground_truth_for_document(document.filename)
    by_key = {(s.period_type.value, s.period_end.isoformat(), s.taxonomy_code): s for s in statements}

    if ground_truth is not None:
        _validate_fixture_shape(ground_truth)
        scorecard["ground_truth_available"] = True
        scorecard["ground_truth_fixture"] = ground_truth.get("document_filename")
        for period_label, period in ground_truth["periods"].items():
            period_type, period_end = period["period_type"], period["period_end"]
            for taxonomy_code, expected_value in period["line_items"].items():
                scorecard["fields_compared"] += 1
                statement = by_key.get((period_type, period_end, taxonomy_code))
                got = float(statement.value) if statement is not None else None
                if got is not None and abs(got - expected_value) <= TOLERANCE:
                    scorecard["exact_matches"] += 1
                else:
                    scorecard["mismatches"].append(
                        {
                            "period_label": period_label,
                            "field": taxonomy_code,
                            "expected": expected_value,
                            "got": got,
                            "source_excerpt": statement.source_excerpt if statement else None,
                            "source_page": statement.source_page if statement else None,
                            "statement_id": str(statement.id) if statement else None,
                        }
                    )

    # --- identity checks: scoped to the document's most recent period, so a
    # comparative/prior-period column reported in the same filing doesn't
    # double the total (see docstring above for why revenue_scale_sanity_check
    # is excluded). ---
    if statements:
        primary_period = max({(s.period_start, s.period_end) for s in statements}, key=lambda p: p[1])
        primary_ids = {s.id for s in statements if (s.period_start, s.period_end) == primary_period}
        result = await db.execute(
            select(ValidationResult).where(ValidationResult.statement_id.in_(primary_ids))
        )
        # Most-recent-per-rule wins, in case validation ran more than once for
        # this period - mirrors ValidationService's own "latest row wins" convention.
        latest_by_rule: dict[str, ValidationResult] = {}
        for vr in sorted(result.scalars().all(), key=lambda v: v.created_at):
            if vr.rule_name in _IDENTITY_RULE_NAMES:
                latest_by_rule[vr.rule_name] = vr

        for rule_name, vr in latest_by_rule.items():
            scorecard["identity_check_results"].append(
                {
                    "rule_name": rule_name,
                    "passed": vr.passed,
                    "expected": float(vr.expected_value),
                    "actual": float(vr.actual_value),
                    "delta": float(vr.delta),
                }
            )
            scorecard["identity_checks_total"] += 1
            if vr.passed:
                scorecard["identity_checks_passed"] += 1

    report = AccuracyReport(
        organization_id=organization_id,
        company_id=company_id,
        document_id=document.id,
        pipeline_version=EXTRACTION_PIPELINE_VERSION,
        scorecard=scorecard,
    )
    db.add(report)
    await db.flush()
    return report
