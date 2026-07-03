import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, get_tenant_context
from app.db.session import get_db
from app.repositories.company import CompanyRepository
from app.repositories.document import DocumentRepository
from app.schemas.document import DocumentRead
from app.services.storage import StorageService, get_storage_service

router = APIRouter(prefix="/companies/{company_id}/documents", tags=["documents"])


async def _get_owned_company_or_404(company_id: uuid.UUID, tenant: TenantContext, db: AsyncSession):
    company = await CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


@router.get("", response_model=list[DocumentRead])
async def list_documents(
    company_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentRead]:
    await _get_owned_company_or_404(company_id, tenant, db)
    documents = await DocumentRepository(db).list_for_company(
        company_id=company_id, organization_id=tenant.org_id
    )
    return [DocumentRead.model_validate(d) for d in documents]


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    company_id: uuid.UUID,
    file: UploadFile,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> DocumentRead:
    await _get_owned_company_or_404(company_id, tenant, db)

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
    await db.commit()
    return DocumentRead.model_validate(document)
