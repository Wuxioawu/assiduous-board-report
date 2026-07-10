import uuid
from datetime import date
from unittest.mock import AsyncMock

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.enums import DocumentStatus, UserRole
from app.models.financial_statement import FinancialStatement
from app.repositories.company import CompanyRepository
from app.repositories.document import DocumentRepository
from app.services.extraction import pipeline
from app.services.extraction.llm_extractor import ExtractedLineItem
from app.services.extraction.pdf_parser import PageText
from tests.conftest import create_org_with_user


class _FakeStorage:
    """Stands in for get_storage_service() in these tests - only .get() is
    exercised by run_extraction, and parse_pdf itself is separately mocked, so
    the returned bytes' actual content never matters."""

    async def get(self, storage_path: str) -> bytes:
        return b"%PDF-fake-bytes"


async def _create_company_and_document(db):
    org, user = await create_org_with_user(db, role=UserRole.OWNER)
    company = await CompanyRepository(db).create(
        organization_id=org.id, name="Senus", industry="Software", fiscal_year_end="06-30", currency="USD"
    )
    document = await DocumentRepository(db).create(
        organization_id=org.id,
        company_id=company.id,
        uploaded_by_user_id=user.id,
        filename="report.pdf",
        file_type="application/pdf",
        storage_path=f"/tmp/test-{uuid.uuid4().hex}.pdf",
    )
    await db.commit()
    return org, company, document


def _line_item(**overrides) -> ExtractedLineItem:
    defaults = dict(
        taxonomy_code="REVENUE",
        value=836991.0,
        currency="EUR",
        period_start=date(2024, 7, 1),
        period_end=date(2025, 6, 30),
        confidence=0.95,
        source_excerpt="Revenue was EUR 836,991",
        source_page=1,
    )
    defaults.update(overrides)
    return ExtractedLineItem(**defaults)


async def test_successful_extraction_marks_document_extracted_and_stores_line_items(monkeypatch):
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_company_and_document(db)

    monkeypatch.setattr(pipeline, "get_storage_service", lambda: _FakeStorage())
    monkeypatch.setattr(pipeline, "parse_pdf", lambda content: [PageText(page_number=1, text="Revenue EUR 836,991")])
    line_items = [_line_item(), _line_item(taxonomy_code="COGS", value=200000.0, confidence=0.8)]
    monkeypatch.setattr(pipeline, "extract_financial_data", AsyncMock(return_value=line_items))
    compute_metrics_mock = AsyncMock()
    monkeypatch.setattr(pipeline, "compute_and_store_metrics", compute_metrics_mock)

    await pipeline.run_extraction(
        document_id=document.id,
        organization_id=org.id,
        company_id=company.id,
        storage_path=document.storage_path,
    )

    async with AsyncSessionLocal() as db:
        refreshed = await DocumentRepository(db).get_by_id(document.id, organization_id=org.id)
        assert refreshed.status == DocumentStatus.EXTRACTED
        assert refreshed.error_message is None

        statements = (
            (
                await db.execute(
                    select(FinancialStatement).where(FinancialStatement.document_id == document.id)
                )
            )
            .scalars()
            .all()
        )
        assert {s.taxonomy_code for s in statements} == {"REVENUE", "COGS"}
        assert all(s.extracted_by == "ai" for s in statements)

        # currency.py's majority-vote detection should have synced the
        # company's currency from the extracted line items (all EUR here).
        refreshed_company = await CompanyRepository(db).get_by_id(company.id, organization_id=org.id)
        assert refreshed_company.currency == "EUR"

    compute_metrics_mock.assert_awaited_once()
    call_kwargs = compute_metrics_mock.await_args.kwargs
    assert call_kwargs["organization_id"] == org.id
    assert call_kwargs["company_id"] == company.id
    assert call_kwargs["period_end"] == date(2025, 6, 30)


async def test_extraction_failure_marks_document_failed_with_error_and_stores_nothing(monkeypatch):
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_company_and_document(db)

    monkeypatch.setattr(pipeline, "get_storage_service", lambda: _FakeStorage())
    monkeypatch.setattr(pipeline, "parse_pdf", lambda content: [PageText(page_number=1, text="garbled")])

    async def _boom(pages):
        raise RuntimeError("LLM extraction failed: rate limited")

    monkeypatch.setattr(pipeline, "extract_financial_data", _boom)
    compute_metrics_mock = AsyncMock()
    monkeypatch.setattr(pipeline, "compute_and_store_metrics", compute_metrics_mock)

    await pipeline.run_extraction(
        document_id=document.id,
        organization_id=org.id,
        company_id=company.id,
        storage_path=document.storage_path,
    )

    async with AsyncSessionLocal() as db:
        refreshed = await DocumentRepository(db).get_by_id(document.id, organization_id=org.id)
        assert refreshed.status == DocumentStatus.FAILED
        assert "rate limited" in refreshed.error_message

        statements = (
            (
                await db.execute(
                    select(FinancialStatement).where(FinancialStatement.document_id == document.id)
                )
            )
            .scalars()
            .all()
        )
        assert statements == []

    compute_metrics_mock.assert_not_awaited()


async def test_pdf_parsing_failure_marks_document_failed(monkeypatch):
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_company_and_document(db)

    def _boom(content):
        raise ValueError("not a valid PDF")

    monkeypatch.setattr(pipeline, "get_storage_service", lambda: _FakeStorage())
    monkeypatch.setattr(pipeline, "parse_pdf", _boom)

    await pipeline.run_extraction(
        document_id=document.id,
        organization_id=org.id,
        company_id=company.id,
        storage_path=document.storage_path,
    )

    async with AsyncSessionLocal() as db:
        refreshed = await DocumentRepository(db).get_by_id(document.id, organization_id=org.id)
        assert refreshed.status == DocumentStatus.FAILED
        assert "not a valid PDF" in refreshed.error_message


async def test_storage_read_failure_marks_document_failed(monkeypatch):
    # Covers the new storage.get() step itself failing (e.g. the object was
    # deleted out from under a pending extraction, or a Supabase download
    # error) - distinct from parse_pdf failing on bytes it did receive.
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_company_and_document(db)

    class _BrokenStorage:
        async def get(self, storage_path: str) -> bytes:
            raise FileNotFoundError(f"No such file: {storage_path}")

    monkeypatch.setattr(pipeline, "get_storage_service", lambda: _BrokenStorage())

    await pipeline.run_extraction(
        document_id=document.id,
        organization_id=org.id,
        company_id=company.id,
        storage_path=document.storage_path,
    )

    async with AsyncSessionLocal() as db:
        refreshed = await DocumentRepository(db).get_by_id(document.id, organization_id=org.id)
        assert refreshed.status == DocumentStatus.FAILED
        assert "No such file" in refreshed.error_message
