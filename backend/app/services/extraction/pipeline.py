import logging
import uuid

from app.core.request_timing import timed_background_job
from app.db.session import AsyncSessionLocal
from app.models.enums import DocumentStatus
from app.models.financial_statement import FinancialStatement
from app.repositories.company import CompanyRepository
from app.repositories.document import DocumentRepository
from app.repositories.financial_statement import FinancialStatementRepository
from app.services.accuracy_report import build_accuracy_report
from app.services.extraction.currency import detect_reporting_currency
from app.services.extraction.llm_extractor import extract_financial_data, normalize_to_full_units
from app.services.extraction.pdf_parser import parse_pdf
from app.services.metrics.fiscal_periods import classify_period_type
from app.services.metrics.orchestrator import compute_and_store_metrics
from app.services.storage import DocumentUnreachableError, get_document_bytes
from app.services.validation.service import run_validation

logger = logging.getLogger(__name__)


async def run_extraction(
    *,
    document_id: uuid.UUID,
    organization_id: uuid.UUID,
    company_id: uuid.UUID,
    generate_accuracy_report: bool = False,
) -> None:
    """Thin wrapper giving the actual extraction run (see _run_extraction below)
    its own db/llm/storage/app timing breakdown, logged under job=extraction -
    it runs as a FastAPI BackgroundTask, entirely after RequestTimingMiddleware
    has already logged and released the triggering request's own timing (see
    app/core/request_timing.py's _log_and_release), so without this the
    single most expensive operation in the app would otherwise be invisible
    to the timing instrumentation."""
    async with timed_background_job("extraction", document_id=document_id):
        await _run_extraction(
            document_id=document_id,
            organization_id=organization_id,
            company_id=company_id,
            generate_accuracy_report=generate_accuracy_report,
        )


async def _run_extraction(
    *,
    document_id: uuid.UUID,
    organization_id: uuid.UUID,
    company_id: uuid.UUID,
    generate_accuracy_report: bool = False,
) -> None:
    """Runs as a FastAPI BackgroundTask after the upload response has been sent,
    so it opens its own DB session rather than reusing the request-scoped one -
    and, for the same reason, reads the document's file via get_document_bytes()
    (which dispatches on the stored path/URL itself, not on the process's
    current STORAGE_PROVIDER config - see services/storage.py) rather than
    through Depends(), which only exists for the request path. Takes no
    storage_path parameter: the freshly-fetched Document row (below) already
    carries it, and that's the one source of truth get_document_bytes() reads.

    generate_accuracy_report=True is set only by the re-extract path (see
    routes/documents.py's re_extract_document) - a fresh upload has no reason
    to score itself against ground truth on every single ingestion, but a
    demo/admin explicitly re-running extraction wants the Accuracy panel to
    reflect the new run immediately rather than showing a stale prior scorecard."""
    async with AsyncSessionLocal() as db:
        doc_repo = DocumentRepository(db)

        document = await doc_repo.update_status(
            document_id, organization_id=organization_id, status=DocumentStatus.PROCESSING
        )
        await db.commit()

        try:
            if document is None:
                raise DocumentUnreachableError(
                    "(unknown - document row not found)", "document not found for this organization"
                )
            content = await get_document_bytes(document)
            pages = parse_pdf(content)
            line_items = await extract_financial_data(pages)

            for item in line_items:
                # Non-blocking: the LLM's period_type (read from the document's own
                # wording, e.g. "Half Year Results...") is trusted over pure date
                # math, since date math alone can't distinguish a genuine stub/short
                # period from a mislabeled one - this just surfaces disagreement for
                # a human to check rather than silently trusting either side.
                expected = classify_period_type(item.period_start, item.period_end)
                if item.period_type != expected:
                    logger.warning(
                        "Extraction: document %s - LLM classified %s %s→%s as period_type=%s, "
                        "but its date span looks like %s - keeping the LLM's value",
                        document_id, item.taxonomy_code, item.period_start, item.period_end,
                        item.period_type.value, expected.value,
                    )

            fs_repo = FinancialStatementRepository(db)
            statements_to_create = [
                FinancialStatement(
                    organization_id=organization_id,
                    company_id=company_id,
                    document_id=document_id,
                    taxonomy_code=item.taxonomy_code,
                    # Normalized from whatever scale the source document
                    # itself used (see UnitScale) to a full-unit integer -
                    # every stored value is comparable regardless of whether
                    # its source table was headed "€" or "€'000".
                    value=normalize_to_full_units(item),
                    currency=item.currency,
                    period_start=item.period_start,
                    period_end=item.period_end,
                    period_type=item.period_type,
                    confidence_score=item.confidence,
                    source_excerpt=item.source_excerpt,
                    source_page=item.source_page,
                    extracted_by="ai",
                )
                for item in line_items
            ]
            await fs_repo.create_many(statements_to_create)
            periods_seen = {(item.period_start, item.period_end) for item in line_items}

            # Sync the company's reporting currency to what was actually
            # extracted, since Company.currency otherwise stays frozen at
            # whatever was chosen (or defaulted) at company-creation time.
            detected_currency = detect_reporting_currency(item.currency for item in line_items)
            if detected_currency is not None:
                company = await CompanyRepository(db).get_by_id(company_id, organization_id=organization_id)
                if company is not None:
                    await CompanyRepository(db).update_currency(company, currency=detected_currency)

            document = await doc_repo.update_status(
                document_id, organization_id=organization_id, status=DocumentStatus.EXTRACTED
            )
            await db.commit()

            # Validates before metrics are (re)computed, so a statement that
            # fails an identity check is already excluded (see
            # FinancialStatementRepository.list_for_company's
            # exclude_needs_review) by the time compute_and_store_metrics
            # reads the period's statements - a chart must never be able to
            # show a value that hasn't been through this.
            for period_start, period_end in periods_seen:
                await run_validation(
                    db,
                    company_id=company_id,
                    organization_id=organization_id,
                    period_start=period_start,
                    period_end=period_end,
                )
            await db.commit()

            for _period_start, period_end in periods_seen:
                await compute_and_store_metrics(
                    db, organization_id=organization_id, company_id=company_id, period_end=period_end
                )

            if generate_accuracy_report and document is not None:
                # Best-effort: a broken ground-truth fixture (or any other
                # accuracy-report failure) must never flip an otherwise-
                # successful extraction to FAILED - that status/error_message
                # belongs to extraction itself, not to this bonus scoring
                # step. A user can always retry generation explicitly via
                # POST .../accuracy-report, which surfaces the real error.
                try:
                    await build_accuracy_report(
                        db, organization_id=organization_id, company_id=company_id, document=document
                    )
                    await db.commit()
                except Exception:  # noqa: BLE001 - see comment above
                    logger.exception(
                        "Accuracy report generation failed after re-extraction of document %s", document_id
                    )
                    await db.rollback()
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
