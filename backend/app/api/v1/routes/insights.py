import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, create_audit_log, get_or_404, get_tenant_context, require_role
from app.db.session import get_db
from app.models.enums import Audience, UserRole
from app.models.insight import Insight
from app.models.user import User
from app.repositories.company import CompanyRepository
from app.repositories.financial_statement import FinancialStatementRepository
from app.repositories.insight import InsightRepository
from app.schemas.insight import InsightRead, StructuredInsightContent
from app.services.insight.generator import generate_narrative_insight, get_or_generate_insight

router = APIRouter(tags=["insights"])


async def _to_insight_read(insight: Insight, db: AsyncSession) -> InsightRead:
    """Resolves the editor's display name (not a column on Insight, mirrors how
    CommentRead.author_name is resolved) and attaches it to the response."""
    editor_name = None
    if insight.edited_by_user_id:
        result = await db.execute(select(User.full_name).where(User.id == insight.edited_by_user_id))
        editor_name = result.scalar_one_or_none()
    read = InsightRead.model_validate(insight)
    read.edited_by_name = editor_name
    return read


@router.get("/companies/{company_id}/insights", response_model=InsightRead)
async def get_insight(
    company_id: uuid.UUID,
    audience: Audience = Query(..., description="Target audience for the narrative"),
    period: date | None = Query(None, description="Reporting period_end; defaults to the latest available period"),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> InsightRead:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    insight = await get_or_404(
        lambda: get_or_generate_insight(
            db, organization_id=tenant.org_id, company_id=company_id, audience=audience, period_end=period
        ),
        detail="No extracted financial data available for this company",
    )
    return await _to_insight_read(insight, db)


@router.post("/companies/{company_id}/insights/regenerate", response_model=InsightRead)
async def regenerate_insight(
    company_id: uuid.UUID,
    audience: Audience = Query(..., description="Target audience for the narrative"),
    period: date | None = Query(None, description="Reporting period_end; defaults to the latest available period"),
    confirm_overwrite_edit: bool = Query(
        False, description="Must be true to regenerate over an insight that has a human edit"
    ),
    # Regenerating can discard a human edit (see the confirm_overwrite_edit
    # check below), so this needs the same write-role gate as editing/reverting
    # an insight (update_insight, revert_insight_to_ai) - this endpoint
    # previously had no role restriction at all.
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
) -> InsightRead:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    # Resolve the target period the same way generate_narrative_insight will, so
    # the existing-edit check below looks at the row that's actually about to be
    # replaced.
    target_period = period
    if target_period is None:
        target_period = await FinancialStatementRepository(db).get_latest_period_end(
            company_id=company_id, organization_id=tenant.org_id
        )

    if target_period is not None:
        existing = await InsightRepository(db).get_for_period_audience(
            company_id=company_id,
            organization_id=tenant.org_id,
            period_end=target_period,
            audience=audience.value,
        )
        if existing is not None and existing.is_edited and not confirm_overwrite_edit:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This insight has manual edits that would be discarded by regenerating. "
                "Confirm to proceed.",
            )

    insight = await get_or_404(
        lambda: generate_narrative_insight(
            db, organization_id=tenant.org_id, company_id=company_id, audience=audience, period_end=period
        ),
        detail="No extracted financial data available for this company",
    )

    await create_audit_log(
        db,
        tenant,
        action="insight_regenerated",
        resource_type="insight",
        resource_id=insight.id,
        extra_data={
            "audience": audience.value,
            "period_end": insight.period_end.isoformat(),
            "discarded_edit": bool(target_period is not None and confirm_overwrite_edit),
        },
    )
    await db.commit()

    return await _to_insight_read(insight, db)


@router.patch("/insights/{insight_id}", response_model=InsightRead)
async def update_insight(
    insight_id: uuid.UUID,
    payload: StructuredInsightContent,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
) -> InsightRead:
    insight_repo = InsightRepository(db)
    insight = await get_or_404(
        lambda: insight_repo.get_by_id(insight_id, organization_id=tenant.org_id), detail="Insight not found"
    )

    await insight_repo.set_edited_content(
        insight, content=payload.model_dump(), edited_by_user_id=tenant.user_id
    )
    await create_audit_log(
        db,
        tenant,
        action="insight_manually_edited",
        resource_type="insight",
        resource_id=insight.id,
        extra_data={"audience": insight.audience, "period_end": insight.period_end.isoformat()},
    )
    await db.commit()
    await db.refresh(insight)
    return await _to_insight_read(insight, db)


@router.post("/insights/{insight_id}/revert-to-ai", response_model=InsightRead)
async def revert_insight_to_ai(
    insight_id: uuid.UUID,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
) -> InsightRead:
    insight_repo = InsightRepository(db)
    insight = await get_or_404(
        lambda: insight_repo.get_by_id(insight_id, organization_id=tenant.org_id), detail="Insight not found"
    )

    await insight_repo.revert_edit(insight)
    await create_audit_log(
        db,
        tenant,
        action="insight_edit_reverted",
        resource_type="insight",
        resource_id=insight.id,
        extra_data={"audience": insight.audience, "period_end": insight.period_end.isoformat()},
    )
    await db.commit()
    await db.refresh(insight)
    return await _to_insight_read(insight, db)
