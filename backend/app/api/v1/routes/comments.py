import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, create_audit_log, get_or_404, get_tenant_context, require_role
from app.db.session import get_db
from app.models.comment import Comment
from app.models.enums import Audience, UserRole
from app.repositories.comment import CommentRepository
from app.repositories.company import CompanyRepository
from app.schemas.comment import CommentCreate, CommentRead, CommentUpdate

router = APIRouter(tags=["comments"])


def _to_read(comment: Comment, author_name: str | None, author_avatar_url: str | None = None) -> CommentRead:
    return CommentRead(
        id=comment.id,
        company_id=comment.company_id,
        period=comment.period,
        audience=comment.audience,
        user_id=comment.user_id,
        author_name=author_name or "Unknown",
        author_avatar_url=author_avatar_url,
        content=comment.content,
        edited=comment.edited,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("/companies/{company_id}/comments", response_model=list[CommentRead])
async def list_comments(
    company_id: uuid.UUID,
    period: date = Query(..., description="Reporting period_end this comment thread belongs to"),
    audience: Audience = Query(..., description="Audience view this comment thread belongs to"),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[CommentRead]:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    rows = await CommentRepository(db).list_for_period_audience(
        company_id=company_id, organization_id=tenant.org_id, period=period, audience=audience.value
    )
    return [_to_read(comment, author_name, avatar_url) for comment, author_name, avatar_url in rows]


@router.post("/companies/{company_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    company_id: uuid.UUID,
    payload: CommentCreate,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
) -> CommentRead:
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    repo = CommentRepository(db)
    comment = await repo.create(
        organization_id=tenant.org_id,
        company_id=company_id,
        period=payload.period,
        audience=payload.audience.value,
        user_id=tenant.user_id,
        content=payload.content,
    )

    await create_audit_log(
        db,
        tenant,
        action="comment_added",
        resource_type="comment",
        resource_id=comment.id,
        extra_data={"period": payload.period.isoformat(), "audience": payload.audience.value},
    )
    await db.commit()
    await db.refresh(comment)

    author_name, author_avatar_url = await repo.get_author_info(tenant.user_id, organization_id=tenant.org_id)
    return _to_read(comment, author_name, author_avatar_url)


@router.patch("/comments/{comment_id}", response_model=CommentRead)
async def update_comment(
    comment_id: uuid.UUID,
    payload: CommentUpdate,
    # Editing is OWNER-only, full stop - authorship grants no exception (a
    # deliberate policy change from the prior "author or ADMIN/OWNER" rule).
    tenant: TenantContext = Depends(require_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
) -> CommentRead:
    repo = CommentRepository(db)
    comment = await get_or_404(
        lambda: repo.get_by_id(comment_id, organization_id=tenant.org_id), detail="Comment not found"
    )

    await repo.update_content(comment, content=payload.content)

    await create_audit_log(
        db,
        tenant,
        action="comment_edited",
        resource_type="comment",
        resource_id=comment.id,
        extra_data={"content": payload.content},
    )
    await db.commit()
    await db.refresh(comment)

    author_name, author_avatar_url = await repo.get_author_info(comment.user_id, organization_id=tenant.org_id)
    return _to_read(comment, author_name, author_avatar_url)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: uuid.UUID,
    # Deletion is OWNER-only, full stop - authorship grants no exception (a
    # deliberate policy change from the prior "author or ADMIN/OWNER" rule).
    tenant: TenantContext = Depends(require_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = CommentRepository(db)
    comment = await get_or_404(
        lambda: repo.get_by_id(comment_id, organization_id=tenant.org_id), detail="Comment not found"
    )

    deleted_content = comment.content
    await repo.delete(comment)

    await create_audit_log(
        db,
        tenant,
        action="comment_deleted",
        resource_type="comment",
        resource_id=comment_id,
        extra_data={"content": deleted_content},
    )
    await db.commit()
