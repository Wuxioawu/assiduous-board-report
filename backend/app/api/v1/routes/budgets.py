import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, create_audit_log, get_or_404, get_tenant_context, require_role
from app.db.session import get_db
from app.models.enums import UserRole
from app.repositories.budget import BudgetRepository
from app.repositories.company import CompanyRepository
from app.schemas.budget import BudgetEntryRead, BudgetPeriodSummary, BudgetSetRequest

router = APIRouter(prefix="/companies/{company_id}/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetEntryRead] | list[BudgetPeriodSummary])
async def list_budgets(
    company_id: uuid.UUID,
    period: date | None = Query(None, description="Reporting period_end; omit to get all periods, grouped"),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[BudgetEntryRead] | list[BudgetPeriodSummary]:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    repo = BudgetRepository(db)

    if period is not None:
        entries = await repo.list_for_period(company_id=company_id, organization_id=tenant.org_id, period_end=period)
        return [BudgetEntryRead.model_validate(e) for e in entries]

    all_entries = await repo.list_all(company_id=company_id, organization_id=tenant.org_id)
    grouped: dict[tuple[date, date], list] = {}
    for entry in all_entries:
        grouped.setdefault((entry.period_start, entry.period_end), []).append(entry)

    summaries = [
        BudgetPeriodSummary(
            period_start=period_start,
            period_end=period_end,
            entries=[BudgetEntryRead.model_validate(e) for e in entries],
            updated_at=max(e.updated_at for e in entries),
        )
        for (period_start, period_end), entries in grouped.items()
    ]
    summaries.sort(key=lambda s: s.period_end, reverse=True)
    return summaries


@router.post("", response_model=list[BudgetEntryRead], status_code=status.HTTP_201_CREATED)
async def set_budgets(
    company_id: uuid.UUID,
    payload: BudgetSetRequest,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
) -> list[BudgetEntryRead]:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    repo = BudgetRepository(db)
    saved = [
        await repo.upsert(
            organization_id=tenant.org_id,
            company_id=company_id,
            period_start=payload.period_start,
            period_end=payload.period_end,
            taxonomy_code=entry.taxonomy_code,
            value=entry.value,
            currency=entry.currency,
            created_by_user_id=tenant.user_id,
        )
        for entry in payload.entries
    ]

    await create_audit_log(
        db,
        tenant,
        action="budget_set",
        resource_type="company",
        resource_id=company_id,
        extra_data={
            "period_start": payload.period_start.isoformat(),
            "period_end": payload.period_end.isoformat(),
            "count": len(saved),
        },
    )
    await db.commit()
    for b in saved:
        await db.refresh(b)

    return [BudgetEntryRead.model_validate(b) for b in saved]


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budgets(
    company_id: uuid.UUID,
    period: date = Query(..., description="Reporting period_end whose budget entries should be deleted"),
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    repo = BudgetRepository(db)
    deleted_count = await repo.delete_for_period(
        company_id=company_id, organization_id=tenant.org_id, period_end=period
    )
    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No budget entries found for this period")

    await create_audit_log(
        db,
        tenant,
        action="budget_deleted",
        resource_type="company",
        resource_id=company_id,
        extra_data={"period_end": period.isoformat(), "count": deleted_count},
    )
    await db.commit()
