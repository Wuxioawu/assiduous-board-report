import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, create_audit_log, get_or_404, get_tenant_context, require_role
from app.db.session import get_db
from app.models.enums import UserRole
from app.repositories.company import CompanyRepository
from app.repositories.document import DocumentRepository
from app.repositories.financial_statement import FinancialStatementRepository
from app.repositories.insight import InsightRepository
from app.repositories.metric import MetricRepository
from app.schemas.document import DocumentRead
from app.services.extraction.pipeline import run_extraction
from app.services.metrics.orchestrator import compute_and_store_metrics
from app.services.storage import StorageService, get_storage_service

router = APIRouter(prefix="/companies/{company_id}/documents", tags=["documents"])


@router.get("", response_model=list[DocumentRead])
async def list_documents(
    company_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentRead]:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )
    documents = await DocumentRepository(db).list_for_company(
        company_id=company_id, organization_id=tenant.org_id
    )
    return [DocumentRead.model_validate(d) for d in documents]


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    company_id: uuid.UUID,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> DocumentRead:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    is_pdf = file.content_type == "application/pdf" or Path(file.filename or "").suffix.lower() == ".pdf"
    if not is_pdf:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF files are supported"
        )

    storage_path = await storage.save(organization_id=tenant.org_id, company_id=company_id, file=file)

    document = await DocumentRepository(db).create(
        organization_id=tenant.org_id,
        company_id=company_id,
        uploaded_by_user_id=tenant.user_id,
        filename=file.filename or "document.pdf",
        file_type="pdf",
        storage_path=storage_path,
    )
    await create_audit_log(
        db,
        tenant,
        action="document_uploaded",
        resource_type="document",
        resource_id=document.id,
        extra_data={"filename": document.filename},
    )
    await db.commit()

    background_tasks.add_task(
        run_extraction,
        document_id=document.id,
        organization_id=tenant.org_id,
        company_id=company_id,
        storage_path=storage_path,
    )

    return DocumentRead.model_validate(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    company_id: uuid.UUID,
    document_id: uuid.UUID,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> None:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    doc_repo = DocumentRepository(db)

    async def _get_document_for_company():
        doc = await doc_repo.get_by_id(document_id, organization_id=tenant.org_id)
        return doc if doc is not None and doc.company_id == company_id else None

    document = await get_or_404(_get_document_for_company, detail="Document not found")

    filename = document.filename

    fs_repo = FinancialStatementRepository(db)
    affected_statements = await fs_repo.list_for_document(
        document_id=document_id, organization_id=tenant.org_id
    )
    affected_periods = {(s.period_start, s.period_end) for s in affected_statements}

    await storage.delete(document.storage_path)
    await fs_repo.delete_for_document(document_id=document_id, organization_id=tenant.org_id)
    await doc_repo.delete(document)

    if affected_periods:
        remaining_period_ends = set(
            await fs_repo.list_period_ends(company_id=company_id, organization_id=tenant.org_id)
        )
        metric_repo = MetricRepository(db)
        insight_repo = InsightRepository(db)
        for period_start, period_end in affected_periods:
            if period_end in remaining_period_ends:
                # Other documents still contribute data for this period - recompute
                # the cached metrics from what remains rather than just clearing them.
                await compute_and_store_metrics(
                    db, organization_id=tenant.org_id, company_id=company_id, period_end=period_end
                )
            else:
                # No statements left for this period at all - drop the now-stale
                # cached metrics outright rather than leaving orphaned rows.
                await metric_repo.delete_for_period(
                    company_id=company_id,
                    organization_id=tenant.org_id,
                    period_start=period_start,
                    period_end=period_end,
                )
            await insight_repo.delete_for_period_audience(
                company_id=company_id, organization_id=tenant.org_id, period_end=period_end
            )

    await create_audit_log(
        db,
        tenant,
        action="document_deleted",
        resource_type="document",
        resource_id=document_id,
        extra_data={"filename": filename},
    )
    await db.commit()
