import json
import uuid
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.company import Company
from app.models.document import Document
from app.models.enums import DocumentStatus, PeriodType, UserRole
from app.models.financial_statement import FinancialStatement
from app.repositories.financial_statement import FinancialStatementRepository
from app.services.validation.service import run_validation
from tests.conftest import auth_headers, create_org_with_user

pytestmark = pytest.mark.asyncio

FIXTURES_DIR = Path(__file__).parent / "fixtures"
GROUND_TRUTH = json.loads((FIXTURES_DIR / "senus_hy2026_ground_truth.json").read_text())
DOCUMENT_FILENAME = GROUND_TRUTH["document_filename"]


async def _create_company_with_document(
    db, org, *, status: DocumentStatus = DocumentStatus.EXTRACTED, error_message: str | None = None
) -> tuple[Company, Document]:
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
    return company, document


async def _create_statements_and_validate(db, org, company, document) -> None:
    statements = [
        FinancialStatement(
            organization_id=org.id,
            company_id=company.id,
            document_id=document.id,
            taxonomy_code=taxonomy_code,
            value=value,
            currency="EUR",
            period_start=date.fromisoformat(period["period_start"]),
            period_end=date.fromisoformat(period["period_end"]),
            period_type=PeriodType(period["period_type"]),
            source_excerpt=f"excerpt for {taxonomy_code}",
            source_page=5,
            extracted_by="ai",
        )
        for period in GROUND_TRUTH["periods"].values()
        for taxonomy_code, value in period["line_items"].items()
    ]
    await FinancialStatementRepository(db).create_many(statements)
    await db.commit()
    for period in GROUND_TRUTH["periods"].values():
        await run_validation(
            db,
            company_id=company.id,
            organization_id=org.id,
            period_start=date.fromisoformat(period["period_start"]),
            period_end=date.fromisoformat(period["period_end"]),
        )
    await db.commit()


class TestAccuracyReportEndpoints:
    async def test_post_accuracy_report_scores_the_senus_document(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, owner = await create_org_with_user(db, role=UserRole.OWNER)
            company, document = await _create_company_with_document(db, org)
            await _create_statements_and_validate(db, org, company, document)
            company_id, document_id = str(company.id), str(document.id)

        response = await client.post(
            f"/api/v1/companies/{company_id}/accuracy-report",
            json={"document_id": document_id},
            headers=auth_headers(owner, org),
        )

        assert response.status_code == 200
        body = response.json()
        assert body["scorecard"]["exact_matches"] == body["scorecard"]["fields_compared"]
        assert body["scorecard"]["identity_checks_total"] == 4
        assert body["scorecard"]["identity_checks_passed"] == 4
        assert body["scorecard"]["ground_truth_available"] is True
        assert body["pipeline_version"]

    async def test_analyst_forbidden_from_generating_accuracy_report(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, analyst = await create_org_with_user(db, role=UserRole.ANALYST)
            company, document = await _create_company_with_document(db, org)
            company_id, document_id = str(company.id), str(document.id)
            await db.commit()

        response = await client.post(
            f"/api/v1/companies/{company_id}/accuracy-report",
            json={"document_id": document_id},
            headers=auth_headers(analyst, org),
        )

        assert response.status_code == 403

    async def test_get_latest_accuracy_report_is_null_until_one_has_run(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, owner = await create_org_with_user(db, role=UserRole.OWNER)
            company, document = await _create_company_with_document(db, org)
            company_id, document_id = str(company.id), str(document.id)
            await db.commit()

        before = await client.get(
            f"/api/v1/companies/{company_id}/documents/{document_id}/accuracy-report",
            headers=auth_headers(owner, org),
        )
        assert before.status_code == 200
        assert before.json() is None

        await client.post(
            f"/api/v1/companies/{company_id}/accuracy-report",
            json={"document_id": document_id},
            headers=auth_headers(owner, org),
        )

        after = await client.get(
            f"/api/v1/companies/{company_id}/documents/{document_id}/accuracy-report",
            headers=auth_headers(owner, org),
        )
        assert after.status_code == 200
        assert after.json() is not None

    async def test_unknown_document_id_404s(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, owner = await create_org_with_user(db, role=UserRole.OWNER)
            company, _document = await _create_company_with_document(db, org)
            company_id = str(company.id)
            await db.commit()

        response = await client.post(
            f"/api/v1/companies/{company_id}/accuracy-report",
            json={"document_id": str(uuid.uuid4())},
            headers=auth_headers(owner, org),
        )

        assert response.status_code == 404

    async def test_pending_document_returns_409_with_a_self_explanatory_detail(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, owner = await create_org_with_user(db, role=UserRole.OWNER)
            company, document = await _create_company_with_document(db, org, status=DocumentStatus.PENDING)
            company_id, document_id = str(company.id), str(document.id)
            await db.commit()

        response = await client.post(
            f"/api/v1/companies/{company_id}/accuracy-report",
            json={"document_id": document_id},
            headers=auth_headers(owner, org),
        )

        assert response.status_code == 409
        assert "not complete" in response.json()["detail"]
        assert "pending" in response.json()["detail"]

    async def test_failed_document_returns_409_with_the_original_extraction_error(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, owner = await create_org_with_user(db, role=UserRole.OWNER)
            company, document = await _create_company_with_document(
                db, org, status=DocumentStatus.FAILED, error_message="LLM returned malformed JSON"
            )
            company_id, document_id = str(company.id), str(document.id)
            await db.commit()

        response = await client.post(
            f"/api/v1/companies/{company_id}/accuracy-report",
            json={"document_id": document_id},
            headers=auth_headers(owner, org),
        )

        assert response.status_code == 409
        assert "LLM returned malformed JSON" in response.json()["detail"]

    async def test_malformed_fixture_returns_422_with_a_self_explanatory_detail(
        self, client: AsyncClient, monkeypatch, tmp_path
    ):
        (tmp_path / "malformed_ground_truth.json").write_text(
            json.dumps(
                {
                    "document_filename": DOCUMENT_FILENAME,
                    "periods": {"HY2026": {"period_type": "HY", "period_end": "2025-12-31"}},
                }
            )
        )
        monkeypatch.setattr("app.services.accuracy_report.FIXTURES_DIR", tmp_path)

        async with AsyncSessionLocal() as db:
            org, owner = await create_org_with_user(db, role=UserRole.OWNER)
            company, document = await _create_company_with_document(db, org)
            await _create_statements_and_validate(db, org, company, document)
            company_id, document_id = str(company.id), str(document.id)

        response = await client.post(
            f"/api/v1/companies/{company_id}/accuracy-report",
            json={"document_id": document_id},
            headers=auth_headers(owner, org),
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Ground-truth fixture malformed: missing key 'periods.HY2026.line_items'"


class TestReExtractEndpoint:
    async def test_re_extract_clears_old_statements_and_schedules_a_fresh_run(
        self, client: AsyncClient, monkeypatch
    ):
        mock_run_extraction = AsyncMock()
        monkeypatch.setattr("app.api.v1.routes.documents.run_extraction", mock_run_extraction)

        async with AsyncSessionLocal() as db:
            org, owner = await create_org_with_user(db, role=UserRole.OWNER)
            company, document = await _create_company_with_document(db, org)
            await _create_statements_and_validate(db, org, company, document)
            company_id, document_id = str(company.id), str(document.id)

        response = await client.post(
            f"/api/v1/companies/{company_id}/documents/{document_id}/re-extract",
            headers=auth_headers(owner, org),
        )

        assert response.status_code == 200
        assert response.json()["status"] == "pending"

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(FinancialStatement).where(FinancialStatement.document_id == uuid.UUID(document_id))
            )
            assert result.scalars().all() == []

        mock_run_extraction.assert_awaited_once()
        assert mock_run_extraction.await_args.kwargs["generate_accuracy_report"] is True
        assert mock_run_extraction.await_args.kwargs["document_id"] == uuid.UUID(document_id)

    async def test_viewer_forbidden_from_re_extracting(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, viewer = await create_org_with_user(db, role=UserRole.VIEWER)
            company, document = await _create_company_with_document(db, org)
            company_id, document_id = str(company.id), str(document.id)
            await db.commit()

        response = await client.post(
            f"/api/v1/companies/{company_id}/documents/{document_id}/re-extract",
            headers=auth_headers(viewer, org),
        )

        assert response.status_code == 403
