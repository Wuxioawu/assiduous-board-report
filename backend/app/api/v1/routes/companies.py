import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, get_tenant_context
from app.db.session import get_db
from app.repositories.company import CompanyRepository
from app.schemas.company import CompanyCreate, CompanyRead

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[CompanyRead])
async def list_companies(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[CompanyRead]:
    companies = await CompanyRepository(db).list_for_org(organization_id=tenant.org_id)
    return [CompanyRead.model_validate(c) for c in companies]


@router.post("", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> CompanyRead:
    company = await CompanyRepository(db).create(
        organization_id=tenant.org_id,
        name=payload.name,
        industry=payload.industry,
        fiscal_year_end=payload.fiscal_year_end,
        currency=payload.currency,
    )
    await db.commit()
    return CompanyRead.model_validate(company)


@router.get("/{company_id}", response_model=CompanyRead)
async def get_company(
    company_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> CompanyRead:
    company = await CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return CompanyRead.model_validate(company)
