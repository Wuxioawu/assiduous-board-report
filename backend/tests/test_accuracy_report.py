import json
import uuid
from datetime import date
from pathlib import Path

import pytest

from app.db.session import AsyncSessionLocal
from app.models.company import Company
from app.models.document import Document
from app.models.enums import DocumentStatus, PeriodType
from app.models.financial_statement import FinancialStatement
from app.models.organization import Organization
from app.repositories.financial_statement import FinancialStatementRepository
from app.services.accuracy_report import (
    ExtractionNotCompleteError,
    MalformedGroundTruthFixtureError,
    _validate_fixture_shape,
    build_accuracy_report,
    find_ground_truth_for_document,
)
from app.services.validation.service import run_validation

pytestmark = pytest.mark.asyncio

FIXTURES_DIR = Path(__file__).parent / "fixtures"
GROUND_TRUTH = json.loads((FIXTURES_DIR / "senus_hy2026_ground_truth.json").read_text())
DOCUMENT_FILENAME = GROUND_TRUTH["document_filename"]


async def _create_org_company_document(
    db, *, status: DocumentStatus = DocumentStatus.EXTRACTED, error_message: str | None = None
) -> tuple[Organization, Company, Document]:
    suffix = uuid.uuid4().hex[:8]
    org = Organization(name=f"Org-{suffix}", slug=f"org-{suffix}")
    db.add(org)
    await db.flush()
    company = Company(organization_id=org.id, name="Senus", currency="EUR")
    db.add(company)
    await db.flush()
    document = Document(
        organization_id=org.id,
        company_id=company.id,
        filename=DOCUMENT_FILENAME,
        file_type="pdf",
        storage_path=f"{org.id}/{company.id}/{uuid.uuid4()}.pdf",
        status=status,
        error_message=error_message,
    )
    db.add(document)
    await db.flush()
    return org, company, document


async def _create_statements_from_ground_truth(
    db, org: Organization, company: Company, document: Document, *, overrides: dict | None = None
) -> list[FinancialStatement]:
    """Creates one FinancialStatement per ground-truth line item, across every
    period the fixture covers - `overrides` maps "PERIOD_LABEL.TAXONOMY_CODE"
    to a deliberately wrong value, for the corrupted-value test below."""
    overrides = overrides or {}
    statements = []
    for period_label, period in GROUND_TRUTH["periods"].items():
        period_type = PeriodType(period["period_type"])
        for taxonomy_code, expected_value in period["line_items"].items():
            override_key = f"{period_label}.{taxonomy_code}"
            value = overrides.get(override_key, expected_value)
            statements.append(
                FinancialStatement(
                    organization_id=org.id,
                    company_id=company.id,
                    document_id=document.id,
                    taxonomy_code=taxonomy_code,
                    value=value,
                    currency="EUR",
                    period_start=date.fromisoformat(period["period_start"]),
                    period_end=date.fromisoformat(period["period_end"]),
                    period_type=period_type,
                    source_excerpt=f"excerpt for {taxonomy_code}",
                    source_page=5,
                    extracted_by="ai",
                )
            )
    created = await FinancialStatementRepository(db).create_many(statements)
    await db.commit()

    # Identity checks are read from persisted ValidationResult rows (see
    # build_accuracy_report), not recomputed - so validation has to actually
    # run first, exactly as it would after a real extraction.
    for period in GROUND_TRUTH["periods"].values():
        await run_validation(
            db,
            company_id=company.id,
            organization_id=org.id,
            period_start=date.fromisoformat(period["period_start"]),
            period_end=date.fromisoformat(period["period_end"]),
        )
    await db.commit()
    return created


async def test_find_ground_truth_for_document_matches_by_filename():
    assert find_ground_truth_for_document(DOCUMENT_FILENAME) is not None
    assert find_ground_truth_for_document("some-other-file.pdf") is None


async def test_all_fields_match_and_all_identities_pass_for_real_senus_values():
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_org_company_document(db)
        await _create_statements_from_ground_truth(db, org, company, document)

        report = await build_accuracy_report(
            db, organization_id=org.id, company_id=company.id, document=document
        )
        await db.commit()

    total_fields = sum(len(p["line_items"]) for p in GROUND_TRUTH["periods"].values())
    scorecard = report.scorecard
    assert scorecard["fields_compared"] == total_fields
    assert scorecard["exact_matches"] == total_fields
    assert scorecard["mismatches"] == []
    assert scorecard["ground_truth_available"] is True
    assert scorecard["ground_truth_fixture"] == DOCUMENT_FILENAME
    # 4 named accounting-identity rules (see services/validation/rules.py),
    # scoped to the document's most recent period (HY2026) - not doubled by
    # the HY2025 comparative period also present in the same document, and
    # not inflated by revenue_scale_sanity_check.
    assert scorecard["identity_checks_total"] == 4
    assert scorecard["identity_checks_passed"] == 4
    assert report.pipeline_version


async def test_a_corrupted_value_surfaces_as_a_mismatch_with_expected_got_and_excerpt():
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_org_company_document(db)
        # Corrupt exactly one HY2026 figure - everything else still matches.
        await _create_statements_from_ground_truth(
            db, org, company, document, overrides={"HY2026.REVENUE": 999_999}
        )

        report = await build_accuracy_report(
            db, organization_id=org.id, company_id=company.id, document=document
        )
        await db.commit()

    scorecard = report.scorecard
    assert scorecard["exact_matches"] == scorecard["fields_compared"] - 1
    mismatches = scorecard["mismatches"]
    assert len(mismatches) == 1
    mismatch = mismatches[0]
    assert mismatch["field"] == "REVENUE"
    assert mismatch["period_label"] == "HY2026"
    assert mismatch["expected"] == 354813
    assert mismatch["got"] == 999_999
    assert mismatch["source_excerpt"] == "excerpt for REVENUE"
    assert mismatch["statement_id"] is not None


async def test_a_field_missing_from_extraction_entirely_surfaces_as_a_mismatch_with_null_got():
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_org_company_document(db)
        statements = await _create_statements_from_ground_truth(db, org, company, document)
        # Simulate extraction having missed this HY2026 field entirely, rather
        # than gotten it wrong - distinct code path from the corrupted-value case.
        hy2026_end = date.fromisoformat(GROUND_TRUTH["periods"]["HY2026"]["period_end"])
        missing = next(
            s for s in statements if s.taxonomy_code == "DEPRECIATION" and s.period_end == hy2026_end
        )
        await db.delete(missing)
        await db.commit()

        report = await build_accuracy_report(
            db, organization_id=org.id, company_id=company.id, document=document
        )
        await db.commit()

    missing_rows = [m for m in report.scorecard["mismatches"] if m["field"] == "DEPRECIATION"]
    assert len(missing_rows) >= 1
    assert missing_rows[0]["got"] is None
    assert missing_rows[0]["source_excerpt"] is None


async def test_document_without_a_ground_truth_fixture_still_runs_identity_checks():
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_org_company_document(db)
        document.filename = "an-unrelated-filing.pdf"
        await db.commit()
        await _create_statements_from_ground_truth(db, org, company, document)

        report = await build_accuracy_report(
            db, organization_id=org.id, company_id=company.id, document=document
        )
        await db.commit()

    scorecard = report.scorecard
    assert scorecard["ground_truth_available"] is False
    assert scorecard["fields_compared"] == 0
    assert scorecard["mismatches"] == []
    # Accounting-identity checks run "always", independent of ground truth.
    assert scorecard["identity_checks_total"] == 4
    assert scorecard["identity_checks_passed"] == 4


async def test_pending_document_raises_extraction_not_complete_error():
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_org_company_document(db, status=DocumentStatus.PENDING)

        with pytest.raises(ExtractionNotCompleteError, match="not complete.*pending"):
            await build_accuracy_report(db, organization_id=org.id, company_id=company.id, document=document)


async def test_processing_document_raises_extraction_not_complete_error():
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_org_company_document(db, status=DocumentStatus.PROCESSING)

        with pytest.raises(ExtractionNotCompleteError, match="not complete.*processing"):
            await build_accuracy_report(db, organization_id=org.id, company_id=company.id, document=document)


async def test_failed_document_raises_extraction_not_complete_error_with_the_original_error():
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_org_company_document(
            db, status=DocumentStatus.FAILED, error_message="LLM returned malformed JSON"
        )

        with pytest.raises(ExtractionNotCompleteError, match="LLM returned malformed JSON"):
            await build_accuracy_report(db, organization_id=org.id, company_id=company.id, document=document)


class TestValidateFixtureShape:
    async def test_accepts_the_real_senus_fixture(self):
        _validate_fixture_shape(GROUND_TRUTH)  # must not raise

    async def test_rejects_a_fixture_missing_periods_entirely(self):
        with pytest.raises(MalformedGroundTruthFixtureError, match="missing key 'periods'"):
            _validate_fixture_shape({"document_filename": "x.pdf"})

    async def test_rejects_a_period_that_is_not_an_object(self):
        with pytest.raises(MalformedGroundTruthFixtureError, match="'periods.HY2026' is not an object"):
            _validate_fixture_shape({"periods": {"HY2026": "not-an-object"}})

    async def test_rejects_a_period_missing_line_items(self):
        with pytest.raises(
            MalformedGroundTruthFixtureError, match="missing key 'periods.HY2026.line_items'"
        ):
            _validate_fixture_shape(
                {"periods": {"HY2026": {"period_type": "HY", "period_end": "2025-12-31"}}}
            )

    async def test_rejects_line_items_that_is_not_an_object(self):
        with pytest.raises(
            MalformedGroundTruthFixtureError, match="'periods.HY2026.line_items' is not an object"
        ):
            _validate_fixture_shape(
                {
                    "periods": {
                        "HY2026": {"period_type": "HY", "period_end": "2025-12-31", "line_items": ["REVENUE"]}
                    }
                }
            )


class TestMalformedFixtureOnDisk:
    """End-to-end: a real malformed fixture FILE on disk, matched by filename,
    surfaces as MalformedGroundTruthFixtureError rather than an opaque
    KeyError - see routes/companies.py for where this becomes a 422."""

    async def test_malformed_fixture_file_raises_instead_of_crashing_with_keyerror(
        self, tmp_path, monkeypatch
    ):
        malformed_filename = "malformed-filing.pdf"
        (tmp_path / "malformed_ground_truth.json").write_text(
            json.dumps({"document_filename": malformed_filename, "periods": {"HY2026": {"no_line_items": True}}})
        )
        monkeypatch.setattr("app.services.accuracy_report.FIXTURES_DIR", tmp_path)

        async with AsyncSessionLocal() as db:
            org, company, document = await _create_org_company_document(db)
            document.filename = malformed_filename
            await db.commit()

            with pytest.raises(MalformedGroundTruthFixtureError, match="missing key"):
                await build_accuracy_report(
                    db, organization_id=org.id, company_id=company.id, document=document
                )


class TestMissingFixtureFile:
    """A fixture file that's genuinely absent (renamed/deleted) is a normal
    case - identities-only mode, not an error - distinct from a fixture that
    exists but is malformed (see TestMalformedFixtureOnDisk above)."""

    async def test_empty_fixtures_directory_falls_back_to_identities_only(self, tmp_path, monkeypatch):
        monkeypatch.setattr("app.services.accuracy_report.FIXTURES_DIR", tmp_path)

        async with AsyncSessionLocal() as db:
            org, company, document = await _create_org_company_document(db)
            await _create_statements_from_ground_truth(db, org, company, document)

            report = await build_accuracy_report(
                db, organization_id=org.id, company_id=company.id, document=document
            )
            await db.commit()

        scorecard = report.scorecard
        assert scorecard["ground_truth_available"] is False
        assert scorecard["fields_compared"] == 0
        assert scorecard["identity_checks_total"] == 4
        assert scorecard["identity_checks_passed"] == 4

    async def test_nonexistent_fixtures_directory_falls_back_to_identities_only(self, tmp_path, monkeypatch):
        monkeypatch.setattr("app.services.accuracy_report.FIXTURES_DIR", tmp_path / "does-not-exist")

        async with AsyncSessionLocal() as db:
            org, company, document = await _create_org_company_document(db)
            await _create_statements_from_ground_truth(db, org, company, document)

            report = await build_accuracy_report(
                db, organization_id=org.id, company_id=company.id, document=document
            )
            await db.commit()

        assert report.scorecard["ground_truth_available"] is False
        assert report.scorecard["identity_checks_total"] == 4
