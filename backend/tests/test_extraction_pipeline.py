import uuid
from datetime import date
from unittest.mock import AsyncMock

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.enums import DocumentStatus, PeriodType, UserRole
from app.models.financial_statement import FinancialStatement
from app.repositories.company import CompanyRepository
from app.repositories.document import DocumentRepository
from app.services.extraction import pipeline
from app.services.extraction.llm_extractor import ExtractedLineItem, UnitScale
from app.services.extraction.pdf_parser import PageText
from app.services.storage import DocumentUnreachableError
from tests.conftest import create_org_with_user

# run_extraction reads document bytes via storage.get_document_bytes(document),
# imported by name into pipeline.py's own namespace - patching pipeline.
# get_document_bytes (the lookup site) rather than app.services.storage.
# get_document_bytes (the definition site) is what actually takes effect here.
# parse_pdf itself is separately mocked in most tests below, so the returned
# bytes' actual content never matters - only that the call succeeds.
_FAKE_PDF_BYTES = b"%PDF-fake-bytes"


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
        unit_in_source=UnitScale.ONE,
        currency="EUR",
        period_start=date(2024, 7, 1),
        period_end=date(2025, 6, 30),
        period_type=PeriodType.FY,
        confidence=0.95,
        source_excerpt="Revenue was EUR 836,991",
        source_page=1,
    )
    defaults.update(overrides)
    return ExtractedLineItem(**defaults)


async def test_successful_extraction_marks_document_extracted_and_stores_line_items(monkeypatch):
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_company_and_document(db)

    monkeypatch.setattr(pipeline, "get_document_bytes", AsyncMock(return_value=_FAKE_PDF_BYTES))
    monkeypatch.setattr(pipeline, "parse_pdf", lambda content: [PageText(page_number=1, text="Revenue EUR 836,991")])
    line_items = [_line_item(), _line_item(taxonomy_code="COGS", value=200000.0, confidence=0.8)]
    monkeypatch.setattr(pipeline, "extract_financial_data", AsyncMock(return_value=line_items))
    compute_metrics_mock = AsyncMock()
    monkeypatch.setattr(pipeline, "compute_and_store_metrics", compute_metrics_mock)

    await pipeline.run_extraction(
        document_id=document.id,
        organization_id=org.id,
        company_id=company.id,
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
        assert all(s.period_type == PeriodType.FY for s in statements)

        # currency.py's majority-vote detection should have synced the
        # company's currency from the extracted line items (all EUR here).
        refreshed_company = await CompanyRepository(db).get_by_id(company.id, organization_id=org.id)
        assert refreshed_company.currency == "EUR"

    compute_metrics_mock.assert_awaited_once()
    call_kwargs = compute_metrics_mock.await_args.kwargs
    assert call_kwargs["organization_id"] == org.id
    assert call_kwargs["company_id"] == company.id
    assert call_kwargs["period_end"] == date(2025, 6, 30)


async def test_period_type_mismatch_is_logged_but_llms_value_is_kept(monkeypatch, caplog):
    # A period spanning Jul-Dec (6 months) whose date math would classify as HY,
    # but which the LLM (reading the document's own wording) says is "Q" -
    # implausible for this specific span, but the point is that pipeline.py
    # trusts the LLM's read of the document over pure date math, only logging
    # the disagreement rather than overriding or rejecting it.
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_company_and_document(db)

    monkeypatch.setattr(pipeline, "get_document_bytes", AsyncMock(return_value=_FAKE_PDF_BYTES))
    monkeypatch.setattr(pipeline, "parse_pdf", lambda content: [PageText(page_number=1, text="Revenue EUR 1")])
    mismatched_item = _line_item(
        period_start=date(2025, 7, 1), period_end=date(2025, 12, 31), period_type=PeriodType.Q
    )
    monkeypatch.setattr(pipeline, "extract_financial_data", AsyncMock(return_value=[mismatched_item]))
    monkeypatch.setattr(pipeline, "compute_and_store_metrics", AsyncMock())

    await pipeline.run_extraction(
        document_id=document.id,
        organization_id=org.id,
        company_id=company.id,
    )

    assert "LLM classified" in caplog.text
    assert "period_type=Q" in caplog.text

    async with AsyncSessionLocal() as db:
        statements = (
            (
                await db.execute(
                    select(FinancialStatement).where(FinancialStatement.document_id == document.id)
                )
            )
            .scalars()
            .all()
        )
        assert len(statements) == 1
        assert statements[0].period_type == PeriodType.Q


async def test_extraction_failure_marks_document_failed_with_error_and_stores_nothing(monkeypatch):
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_company_and_document(db)

    monkeypatch.setattr(pipeline, "get_document_bytes", AsyncMock(return_value=_FAKE_PDF_BYTES))
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

    monkeypatch.setattr(pipeline, "get_document_bytes", AsyncMock(return_value=_FAKE_PDF_BYTES))
    monkeypatch.setattr(pipeline, "parse_pdf", _boom)

    await pipeline.run_extraction(
        document_id=document.id,
        organization_id=org.id,
        company_id=company.id,
    )

    async with AsyncSessionLocal() as db:
        refreshed = await DocumentRepository(db).get_by_id(document.id, organization_id=org.id)
        assert refreshed.status == DocumentStatus.FAILED
        assert "not a valid PDF" in refreshed.error_message


async def test_storage_read_failure_marks_document_failed(monkeypatch):
    # Covers get_document_bytes() itself failing - the object was deleted out
    # from under a pending extraction, a Supabase download error, or (per the
    # storage-location refactor - see app.services.storage) the document's
    # stored path/URL simply being unreachable - distinct from parse_pdf
    # failing on bytes it did receive. Raises the same DocumentUnreachableError
    # run_extraction actually catches now, rather than a bare FileNotFoundError,
    # so this exercises the real failure path instead of a stand-in for it.
    async with AsyncSessionLocal() as db:
        org, company, document = await _create_company_and_document(db)

    async def _boom(document):
        raise DocumentUnreachableError(document.storage_path, "file not found on local disk")

    monkeypatch.setattr(pipeline, "get_document_bytes", _boom)

    await pipeline.run_extraction(
        document_id=document.id,
        organization_id=org.id,
        company_id=company.id,
    )

    async with AsyncSessionLocal() as db:
        refreshed = await DocumentRepository(db).get_by_id(document.id, organization_id=org.id)
        assert refreshed.status == DocumentStatus.FAILED
        assert "unreachable" in refreshed.error_message
        assert document.storage_path in refreshed.error_message
