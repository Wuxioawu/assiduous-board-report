import logging
import uuid

from app.db.session import AsyncSessionLocal
from app.models.enums import DocumentStatus
from app.repositories.document import DocumentRepository
from app.repositories.financial_statement import FinancialStatementRepository
from app.services.extraction.llm_extractor import extract_financial_data
from app.services.extraction.pdf_parser import parse_pdf

logger = logging.getLogger(__name__)


async def run_extraction(
    *,
    document_id: uuid.UUID,
    organization_id: uuid.UUID,
    company_id: uuid.UUID,
    storage_path: str,
) -> None:
    """Runs as a FastAPI BackgroundTask after the upload response has been sent,
    so it opens its own DB session rather than reusing the request-scoped one."""
    async with AsyncSessionLocal() as db:
        doc_repo = DocumentRepository(db)

        await doc_repo.update_status(
            document_id, organization_id=organization_id, status=DocumentStatus.PROCESSING
        )
        await db.commit()

        try:
            pages = parse_pdf(storage_path)
            line_items = await extract_financial_data(pages)

            fs_repo = FinancialStatementRepository(db)
            for item in line_items:
                await fs_repo.create(
                    organization_id=organization_id,
                    company_id=company_id,
                    document_id=document_id,
                    taxonomy_code=item.taxonomy_code,
                    value=item.value,
                    currency=item.currency,
                    period_start=item.period_start,
                    period_end=item.period_end,
                    confidence_score=item.confidence,
                    source_excerpt=item.source_excerpt,
                    source_page=item.source_page,
                    extracted_by="ai",
                )

            await doc_repo.update_status(
                document_id, organization_id=organization_id, status=DocumentStatus.EXTRACTED
            )
            await db.commit()
        except Exception as exc:  # noqa: BLE001 - extraction failures must never crash the background task
            logger.exception("Extraction failed for document %s", document_id)
            await db.rollback()
            await doc_repo.update_status(
                document_id,
                organization_id=organization_id,
                status=DocumentStatus.FAILED,
                error_message=str(exc)[:2000],
            )
            await db.commit()
