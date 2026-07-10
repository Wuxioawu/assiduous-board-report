import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, get_tenant_context
from app.db.session import get_db
from app.repositories.audit_log import AuditLogRepository
from app.repositories.company import CompanyRepository
from app.repositories.financial_statement import FinancialStatementRepository
from app.repositories.insight import InsightRepository
from app.schemas.audit_log import AuditLogRead
from app.schemas.financial_statement import FinancialStatementRead, FinancialStatementUpdate
from app.services.metrics.orchestrator import compute_and_store_metrics

router = APIRouter(tags=["financial-statements"])


@router.get("/companies/{company_id}/financial-statements", response_model=list[FinancialStatementRead])
async def list_financial_statements(
    company_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[FinancialStatementRead]:
    company = await CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    statements = await FinancialStatementRepository(db).list_for_company(
        company_id=company_id, organization_id=tenant.org_id
    )
    return [FinancialStatementRead.model_validate(s) for s in statements]


@router.get("/financial-statements/{statement_id}/audit-log", response_model=list[AuditLogRead])
async def list_financial_statement_audit_log(
    statement_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogRead]:
    statement = await FinancialStatementRepository(db).get_by_id(statement_id, organization_id=tenant.org_id)
    if statement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Financial statement not found")

    entries = await AuditLogRepository(db).list_for_resource(
        organization_id=tenant.org_id, resource_type="financial_statement", resource_id=statement_id
    )
    return [AuditLogRead.model_validate(e) for e in entries]


@router.patch("/financial-statements/{statement_id}", response_model=FinancialStatementRead)
async def update_financial_statement(
    statement_id: uuid.UUID,
    payload: FinancialStatementUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> FinancialStatementRead:
    repo = FinancialStatementRepository(db)
    statement = await repo.get_by_id(statement_id, organization_id=tenant.org_id)
    if statement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Financial statement not found")

    previous_value = statement.value
    statement.value = payload.value
    statement.extracted_by = "manual_override"
    await db.flush()

    await AuditLogRepository(db).create(
        organization_id=tenant.org_id,
        user_id=tenant.user_id,
        action="financial_statement.manual_override",
        resource_type="financial_statement",
        resource_id=statement.id,
        extra_data={
            "taxonomy_code": statement.taxonomy_code,
            "previous_value": str(previous_value),
            "new_value": str(payload.value),
        },
    )
    await db.commit()
    await db.refresh(statement)

    await compute_and_store_metrics(
        db,
        organization_id=tenant.org_id,
        company_id=statement.company_id,
        period_end=statement.period_end,
    )

    # Invalidate cached narratives for this period across all audiences so the
    # next GET regenerates them against the corrected underlying data.
    await InsightRepository(db).delete_for_period_audience(
        company_id=statement.company_id,
        organization_id=tenant.org_id,
        period_end=statement.period_end,
    )
    await db.commit()

    return FinancialStatementRead.model_validate(statement)
