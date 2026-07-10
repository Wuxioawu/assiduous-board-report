import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, create_audit_log, get_or_404, get_tenant_context, require_role
from app.db.session import get_db
from app.models.enums import InvitationType, UserRole
from app.models.user import User
from app.repositories.industry_benchmark import IndustryBenchmarkRepository
from app.repositories.invitation import InvitationRepository
from app.repositories.organization import OrganizationRepository
from app.repositories.user import UserRepository
from app.schemas.industry_benchmark import IndustryBenchmarkRead, IndustryBenchmarkUpsert
from app.schemas.invitation import InvitationCreate, InvitationRead, InviteEligibility
from app.schemas.member import MemberRead, MemberRoleUpdate
from app.services.email.mailer import render_invitation_email, send_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/organizations", tags=["organizations"])

INVITATION_EXPIRE_DAYS = 7

# Who a given role is allowed to invite at: an ADMIN can grow the team but
# cannot mint another OWNER; only an OWNER can do that.
INVITE_PERMISSIONS: dict[UserRole, set[UserRole]] = {
    UserRole.OWNER: {UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER},
    UserRole.ADMIN: {UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER},
}


async def _classify_invite_email(
    db: AsyncSession, *, email: str, org_id: uuid.UUID
) -> tuple[InvitationType, User | None, str | None]:
    """Classifies what inviting this email means before anything is created:
    a brand-new account, a cross-org transfer, or (raised as an error) a no-op
    because they're already a member of this same organization."""
    existing_user = await UserRepository(db).get_by_email(email)
    if existing_user is None:
        return InvitationType.NEW_USER, None, None
    if existing_user.organization_id == org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This person is already a member of your organization",
        )
    current_org = await OrganizationRepository(db).get_by_id(existing_user.organization_id)
    current_org_name = current_org.name if current_org is not None else None
    return InvitationType.TRANSFER, existing_user, current_org_name


@router.get("/invitations/check", response_model=InviteEligibility)
async def check_invite_eligibility(
    email: str = Query(...),
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> InviteEligibility:
    invitation_type, _existing_user, current_organization_name = await _classify_invite_email(
        db, email=email, org_id=tenant.org_id
    )
    return InviteEligibility(invitation_type=invitation_type, current_organization_name=current_organization_name)


@router.post("/invitations", response_model=InvitationRead, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    payload: InvitationCreate,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> InvitationRead:
    requester_role = UserRole(tenant.role)
    if payload.role not in INVITE_PERMISSIONS[requester_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{requester_role.value.capitalize()}s cannot invite a user as {payload.role.value}",
        )

    user_repo = UserRepository(db)
    invitation_type, _existing_user, current_organization_name = await _classify_invite_email(
        db, email=payload.email, org_id=tenant.org_id
    )

    inviter = await user_repo.get_by_id(tenant.user_id, organization_id=tenant.org_id)
    organization = await OrganizationRepository(db).get_by_id(tenant.org_id)
    assert inviter is not None and organization is not None

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=INVITATION_EXPIRE_DAYS)
    invitation = await InvitationRepository(db).create(
        organization_id=tenant.org_id,
        email=payload.email,
        role=payload.role,
        invited_by_user_id=tenant.user_id,
        token=token,
        expires_at=expires_at,
        invitation_type=invitation_type,
    )
    await create_audit_log(
        db,
        tenant,
        action="user_invited",
        resource_type="invitation",
        resource_id=invitation.id,
        extra_data={"email": payload.email, "role": payload.role.value, "invitation_type": invitation_type.value},
    )
    await db.commit()
    await db.refresh(invitation)

    # The invitation row is already committed above - email delivery is
    # best-effort from here on and must never turn a successful invite into a
    # 500 (matches send_email's own "never break the calling flow" contract;
    # this also covers template-rendering failures, which happen before
    # send_email's own try/except would ever run).
    try:
        subject, html_body = render_invitation_email(
            inviter_name=inviter.full_name,
            organization_name=organization.name,
            role=payload.role.value,
            token=token,
            expires_days=INVITATION_EXPIRE_DAYS,
            is_transfer=invitation_type == InvitationType.TRANSFER,
            current_organization_name=current_organization_name,
        )
        email_sent = await send_email(payload.email, subject, html_body)
    except Exception:
        logger.exception("Invitation record %s created but building/sending the email failed", invitation.id)
        email_sent = False
    if not email_sent:
        logger.error("Invitation record %s created but delivery to %s failed", invitation.id, payload.email)

    invitation_read = InvitationRead.model_validate(invitation)
    return invitation_read.model_copy(update={"email_sent": email_sent})


@router.get("/invitations", response_model=list[InvitationRead])
async def list_invitations(
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[InvitationRead]:
    invitations = await InvitationRepository(db).list_pending_for_org(organization_id=tenant.org_id)
    await db.commit()
    return [InvitationRead.model_validate(i) for i in invitations]


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invitation(
    invitation_id: uuid.UUID,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = InvitationRepository(db)
    invitation = await get_or_404(
        lambda: repo.get_by_id(invitation_id, organization_id=tenant.org_id),
        detail="Invitation not found",
    )
    invitation_email = invitation.email
    await repo.delete(invitation)
    await create_audit_log(
        db,
        tenant,
        action="invitation_revoked",
        resource_type="invitation",
        resource_id=invitation_id,
        extra_data={"email": invitation_email},
    )
    await db.commit()


@router.get("/members", response_model=list[MemberRead])
async def list_members(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[MemberRead]:
    users = await UserRepository(db).list_for_org(organization_id=tenant.org_id)
    return [MemberRead.model_validate(u) for u in users]


@router.patch("/members/{user_id}/role", response_model=MemberRead)
async def update_member_role(
    user_id: uuid.UUID,
    payload: MemberRoleUpdate,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER)),
    db: AsyncSession = Depends(get_db),
) -> MemberRead:
    user_repo = UserRepository(db)
    target = await get_or_404(
        lambda: user_repo.get_by_id(user_id, organization_id=tenant.org_id), detail="User not found"
    )

    if target.role == UserRole.OWNER and payload.role != UserRole.OWNER:
        owner_count = await user_repo.count_by_role(organization_id=tenant.org_id, role=UserRole.OWNER)
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change the role of the last remaining owner",
            )

    previous_role = target.role
    await user_repo.set_role(target, role=payload.role)
    await create_audit_log(
        db,
        tenant,
        action="user_role_changed",
        resource_type="user",
        resource_id=target.id,
        extra_data={"previous_role": previous_role.value, "new_role": payload.role.value},
    )
    await db.commit()
    await db.refresh(target)
    return MemberRead.model_validate(target)


@router.delete("/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: uuid.UUID,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> None:
    if user_id == tenant.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself from the organization",
        )

    user_repo = UserRepository(db)
    target = await get_or_404(
        lambda: user_repo.get_by_id(user_id, organization_id=tenant.org_id), detail="User not found"
    )

    requester_role = UserRole(tenant.role)
    if target.role == UserRole.OWNER and requester_role != UserRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only an owner can remove another owner"
        )

    if target.role == UserRole.OWNER:
        owner_count = await user_repo.count_by_role(organization_id=tenant.org_id, role=UserRole.OWNER)
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last remaining owner of the organization",
            )

    removed_name, removed_role = target.full_name, target.role
    await user_repo.delete(target)
    await create_audit_log(
        db,
        tenant,
        action="user_removed",
        resource_type="user",
        resource_id=user_id,
        extra_data={"removed_user_name": removed_name, "removed_user_role": removed_role.value},
    )
    await db.commit()


@router.get("/benchmarks", response_model=list[IndustryBenchmarkRead])
async def list_benchmarks(
    industry: str = Query(..., description="Industry to fetch benchmark entries for"),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[IndustryBenchmarkRead]:
    benchmarks = await IndustryBenchmarkRepository(db).list_for_industry(
        organization_id=tenant.org_id, industry=industry
    )
    return [IndustryBenchmarkRead.model_validate(b, from_attributes=True) for b in benchmarks]


@router.post("/benchmarks", response_model=IndustryBenchmarkRead, status_code=status.HTTP_201_CREATED)
async def set_benchmark(
    payload: IndustryBenchmarkUpsert,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> IndustryBenchmarkRead:
    benchmark = await IndustryBenchmarkRepository(db).upsert(
        organization_id=tenant.org_id,
        industry=payload.industry,
        metric_key=payload.metric_key,
        period_label=payload.period_label,
        benchmark_value=payload.benchmark_value,
        source=payload.source,
        created_by_user_id=tenant.user_id,
    )
    await create_audit_log(
        db,
        tenant,
        action="benchmark_set",
        resource_type="industry_benchmark",
        resource_id=benchmark.id,
        extra_data={
            "industry": payload.industry,
            "metric_key": payload.metric_key,
            "period_label": payload.period_label,
        },
    )
    await db.commit()
    await db.refresh(benchmark)
    return IndustryBenchmarkRead.model_validate(benchmark, from_attributes=True)


@router.delete("/benchmarks/{benchmark_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_benchmark(
    benchmark_id: uuid.UUID,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> None:
    repo = IndustryBenchmarkRepository(db)
    benchmark = await get_or_404(
        lambda: repo.get_by_id(benchmark_id, organization_id=tenant.org_id), detail="Benchmark not found"
    )

    deleted_data = {
        "industry": benchmark.industry,
        "metric_key": benchmark.metric_key,
        "period_label": benchmark.period_label,
    }
    await repo.delete(benchmark)

    await create_audit_log(
        db,
        tenant,
        action="benchmark_deleted",
        resource_type="industry_benchmark",
        resource_id=benchmark_id,
        extra_data=deleted_data,
    )
    await db.commit()
