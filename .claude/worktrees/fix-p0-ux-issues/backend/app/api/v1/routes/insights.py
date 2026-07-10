import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, get_tenant_context
from app.db.session import get_db
from app.models.enums import Audience
from app.repositories.company import CompanyRepository
from app.schemas.insight import InsightRead
from app.services.insight.generator import generate_narrative_insight, get_or_generate_insight

router = APIRouter(tags=["insights"])


@router.get("/companies/{company_id}/insights", response_model=InsightRead)
async def get_insight(
    company_id: uuid.UUID,
    audience: Audience = Query(..., description="Target audience for the narrative"),
    period: date | None = Query(None, description="Reporting period_end; defaults to the latest available period"),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> InsightRead:
    company = await CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    insight = await get_or_generate_insight(
        db, organization_id=tenant.org_id, company_id=company_id, audience=audience, period_end=period
    )
    if insight is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No extracted financial data available for this company",
        )
    return InsightRead.model_validate(insight)


@router.post("/companies/{company_id}/insights/regenerate", response_model=InsightRead)
async def regenerate_insight(
    company_id: uuid.UUID,
    audience: Audience = Query(..., description="Target audience for the narrative"),
    period: date | None = Query(None, description="Reporting period_end; defaults to the latest available period"),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> InsightRead:
    company = await CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    insight = await generate_narrative_insight(
        db, organization_id=tenant.org_id, company_id=company_id, audience=audience, period_end=period
    )
    if insight is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No extracted financial data available for this company",
        )
    return InsightRead.model_validate(insight)
