import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, create_audit_log, get_or_404, get_tenant_context, require_role
from app.db.session import get_db
from app.models.enums import UserRole
from app.repositories.audit_log import AuditLogRepository
from app.repositories.company import CompanyRepository
from app.repositories.financial_statement import FinancialStatementRepository
from app.repositories.insight import InsightRepository
from app.schemas.financial_statement import (
    FinancialStatementCreate,
    FinancialStatementHistoryEntry,
    FinancialStatementRead,
    FinancialStatementUpdate,
)
from app.services.extraction.taxonomy import TAXONOMY
from app.services.metrics.fiscal_periods import classify_period_type
from app.services.metrics.orchestrator import compute_and_store_metrics
from app.services.validation.service import run_validation

router = APIRouter(tags=["financial-statements"])


@router.get("/companies/{company_id}/financial-statements", response_model=list[FinancialStatementRead])
async def list_financial_statements(
    company_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[FinancialStatementRead]:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    statements = await FinancialStatementRepository(db).list_for_company(
        company_id=company_id, organization_id=tenant.org_id
    )
    return [FinancialStatementRead.model_validate(s) for s in statements]


@router.post(
    "/companies/{company_id}/financial-statements",
    response_model=FinancialStatementRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_financial_statement(
    company_id: uuid.UUID,
    payload: FinancialStatementCreate,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
) -> FinancialStatementRead:
    """Adds a line item that was never extracted at all for this period - distinct from
    PATCH /financial-statements/{id}, which corrects a value that already exists."""
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    if payload.taxonomy_code not in TAXONOMY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown taxonomy code: {payload.taxonomy_code}",
        )
    if payload.period_end < payload.period_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="period_end must be on or after period_start")

    repo = FinancialStatementRepository(db)
    existing = await repo.get_by_taxonomy_and_period(
        company_id=company_id,
        organization_id=tenant.org_id,
        taxonomy_code=payload.taxonomy_code,
        period_start=payload.period_start,
        period_end=payload.period_end,
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{payload.taxonomy_code} already has a value for this period - "
                "use the edit action on the existing row instead of adding a new one."
            ),
        )

    statement = await repo.create(
        organization_id=tenant.org_id,
        company_id=company_id,
        document_id=None,
        taxonomy_code=payload.taxonomy_code,
        value=payload.value,
        currency=payload.currency,
        period_start=payload.period_start,
        period_end=payload.period_end,
        # No document to read a stated period_type from for a manual entry -
        # classify_period_type's date-span heuristic is the best signal
        # available (see its docstring for why this differs from the
        # LLM-extraction path, which trusts the document's own wording).
        period_type=classify_period_type(payload.period_start, payload.period_end),
        confidence_score=None,
        source_excerpt=payload.source_note,
        source_page=None,
        extracted_by="manual_entry",
    )

    await create_audit_log(
        db,
        tenant,
        action="financial_statement_manually_added",
        resource_type="financial_statement",
        resource_id=statement.id,
        extra_data={
            "taxonomy_code": statement.taxonomy_code,
            "value": str(statement.value),
            "period_start": statement.period_start.isoformat(),
            "period_end": statement.period_end.isoformat(),
        },
    )
    await db.commit()
    await db.refresh(statement)

    await run_validation(
        db,
        company_id=company_id,
        organization_id=tenant.org_id,
        period_start=statement.period_start,
        period_end=statement.period_end,
    )
    await db.commit()

    await compute_and_store_metrics(
        db,
        organization_id=tenant.org_id,
        company_id=company_id,
        period_end=statement.period_end,
    )

    # Invalidate cached narratives for this period across all audiences so the next
    # GET regenerates them against the newly-added underlying data.
    await InsightRepository(db).delete_for_period_audience(
        company_id=company_id,
        organization_id=tenant.org_id,
        period_end=statement.period_end,
    )
    await db.commit()

    return FinancialStatementRead.model_validate(statement)


@router.get(
    "/financial-statements/{statement_id}/history",
    response_model=list[FinancialStatementHistoryEntry],
)
async def get_financial_statement_history(
    statement_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[FinancialStatementHistoryEntry]:
    await get_or_404(
        lambda: FinancialStatementRepository(db).get_by_id(statement_id, organization_id=tenant.org_id),
        detail="Financial statement not found",
    )

    entries = await AuditLogRepository(db).list_for_resource(
        organization_id=tenant.org_id,
        resource_type="financial_statement",
        resource_id=statement_id,
    )
    return [
        FinancialStatementHistoryEntry(
            id=entry.id,
            previous_value=float(entry.extra_data["previous_value"]),
            new_value=float(entry.extra_data["new_value"]),
            changed_by_user_id=entry.user_id,
            changed_at=entry.created_at,
        )
        for entry in entries
        if entry.extra_data
    ]


@router.patch("/financial-statements/{statement_id}", response_model=FinancialStatementRead)
async def update_financial_statement(
    statement_id: uuid.UUID,
    payload: FinancialStatementUpdate,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
) -> FinancialStatementRead:
    repo = FinancialStatementRepository(db)
    statement = await get_or_404(
        lambda: repo.get_by_id(statement_id, organization_id=tenant.org_id),
        detail="Financial statement not found",
    )

    previous_value = statement.value
    statement.value = payload.value
    statement.extracted_by = "manual_override"
    await db.flush()

    await create_audit_log(
        db,
        tenant,
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

    await run_validation(
        db,
        company_id=statement.company_id,
        organization_id=tenant.org_id,
        period_start=statement.period_start,
        period_end=statement.period_end,
    )
    await db.commit()

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
