import logging
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_pending_2fa_token,
    decode_pending_2fa_token,
    generate_backup_codes,
    generate_qr_code_base64,
    generate_totp_secret,
    get_totp_provisioning_uri,
    hash_backup_codes,
    hash_password,
    verify_password,
    verify_totp_code,
)
from app.db.session import get_db
from app.models.enums import InvitationStatus, InvitationType, UserRole
from app.models.invitation import Invitation
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.repositories.invitation import InvitationRepository
from app.repositories.organization import OrganizationRepository
from app.repositories.user import UserRepository
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
)
from app.schemas.invitation import (
    AcceptInvitationBlockedResponse,
    AcceptInvitationRequest,
    AcceptInvitationWithDeletionRequest,
    InvitationPreview,
)
from app.schemas.token import Token
from app.schemas.two_factor import (
    BackupCodesResponse,
    DisableTwoFactorRequest,
    LoginVerifyRequest,
    PendingTwoFactorResponse,
    TwoFactorSetupResponse,
    VerifySetupRequest,
)
from app.schemas.user import AvatarResponse, UserRead
from app.services.avatar import ALLOWED_AVATAR_CONTENT_TYPES, process_avatar_image
from app.services.email.mailer import render_password_reset_email, send_email
from app.services.organization_deletion import purge_organization_company_data
from app.services.storage import StorageService, get_storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

RESET_TOKEN_EXPIRE_MINUTES = 30
GENERIC_FORGOT_PASSWORD_MESSAGE = "If an account with that email exists, a reset link has been sent."
INVALID_2FA_CODE_MESSAGE = "Invalid verification code."


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or uuid.uuid4().hex[:8]


def _user_read(user: User, *, organization_name: str) -> UserRead:
    return UserRead(
        id=user.id,
        organization_id=user.organization_id,
        organization_name=organization_name,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        totp_enabled=user.totp_enabled,
        avatar_url=user.avatar_url,
    )


async def _issue_auth_response(db: AsyncSession, user: User) -> AuthResponse:
    organization = await OrganizationRepository(db).get_by_id(user.organization_id)
    assert organization is not None
    token = create_access_token(user_id=user.id, org_id=user.organization_id, role=user.role.value)
    return AuthResponse(
        token=Token(access_token=token), user=_user_read(user, organization_name=organization.name)
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    user_repo = UserRepository(db)
    if await user_repo.get_by_email(payload.email) is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    org_repo = OrganizationRepository(db)
    base_slug = _slugify(payload.organization_name)
    slug = base_slug
    suffix = 2
    while await org_repo.slug_exists(slug):
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    try:
        organization = await org_repo.create(name=payload.organization_name, slug=slug)
        user = await user_repo.create(
            organization_id=organization.id,
            email=payload.email,
            hashed_password=hash_password(payload.password),
            full_name=payload.full_name,
            role=UserRole.OWNER,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Registration failed") from None

    return await _issue_auth_response(db, user)


@router.post("/login", response_model=AuthResponse | PendingTwoFactorResponse)
async def login(
    payload: LoginRequest, db: AsyncSession = Depends(get_db)
) -> AuthResponse | PendingTwoFactorResponse:
    user = await UserRepository(db).get_by_email(payload.email)
    if user is None or not user.is_active or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if user.totp_enabled:
        pending_token = create_pending_2fa_token(user_id=user.id)
        return PendingTwoFactorResponse(pending_token=pending_token)

    return await _issue_auth_response(db, user)


@router.get("/me", response_model=UserRead)
async def get_me(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> UserRead:
    organization = await OrganizationRepository(db).get_by_id(user.organization_id)
    assert organization is not None
    return _user_read(user, organization_name=organization.name)


@router.post("/me/avatar", response_model=AvatarResponse)
async def upload_avatar(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> AvatarResponse:
    if file.content_type not in ALLOWED_AVATAR_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPG, PNG, or WEBP images are supported"
        )

    settings = get_settings()
    raw = await file.read()
    if len(raw) > settings.avatar_max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image exceeds the {settings.avatar_max_size_bytes // (1024 * 1024)}MB size limit",
        )

    try:
        processed = process_avatar_image(raw, dimension=settings.avatar_dimension_px)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # Remove the previous file (if any) so re-uploads don't accumulate orphaned
    # files on disk - avatar_storage_path is internal-only, never sent to the client.
    if user.avatar_storage_path:
        await storage.delete(user.avatar_storage_path)

    storage_path = await storage.save_avatar_bytes(user_id=user.id, filename="avatar.jpg", content=processed)
    # The URL must change on every upload, not just the underlying file - otherwise
    # it's identical across uploads (same user_id), so a browser has no signal to
    # refetch and will happily keep showing the previous photo from cache. Reusing
    # the storage filename's own UUID (already unique per upload) as a version
    # segment gives every upload a genuinely new, cacheable-forever URL.
    avatar_version = Path(storage_path).stem
    avatar_url = f"/api/v1/users/{user.id}/avatar/{avatar_version}"
    await UserRepository(db).set_avatar(user, avatar_url=avatar_url, avatar_storage_path=storage_path)
    await AuditLogRepository(db).create(
        organization_id=user.organization_id,
        user_id=user.id,
        action="avatar_updated",
        resource_type="user",
        resource_id=user.id,
    )
    await db.commit()
    return AvatarResponse(avatar_url=avatar_url)


@router.delete("/me/avatar", response_model=AvatarResponse)
async def delete_avatar(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> AvatarResponse:
    if user.avatar_storage_path:
        await storage.delete(user.avatar_storage_path)
    await UserRepository(db).clear_avatar(user)
    await AuditLogRepository(db).create(
        organization_id=user.organization_id,
        user_id=user.id,
        action="avatar_removed",
        resource_type="user",
        resource_id=user.id,
    )
    await db.commit()
    return AvatarResponse(avatar_url=None)


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    await UserRepository(db).set_password(user, hashed_password=hash_password(payload.new_password))
    await AuditLogRepository(db).create(
        organization_id=user.organization_id,
        user_id=user.id,
        action="password_changed",
        resource_type="user",
        resource_id=user.id,
    )
    await db.commit()
    return MessageResponse(message="Password updated successfully")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(payload.email)
    if user is not None and user.is_active:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
        await user_repo.set_reset_token(user, token=token, expires_at=expires_at)
        await db.commit()

        # Best-effort from here on - the reset token is already committed, and a
        # broken SMTP/template config must never turn this into a 500 (matches
        # send_email's own "never break the calling flow" contract; this also
        # covers template-rendering failures, which happen before send_email's
        # own try/except would ever run).
        try:
            subject, html_body = render_password_reset_email(
                token=token, expires_minutes=RESET_TOKEN_EXPIRE_MINUTES
            )
            email_sent = await send_email(payload.email, subject, html_body)
        except Exception:
            logger.exception("Password reset token issued for %s but building/sending the email failed", payload.email)
            email_sent = False
        if not email_sent:
            logger.error("Password reset token issued for %s but email delivery failed", payload.email)

    # Always the same response, whether or not the email is registered, so this endpoint
    # can't be used to enumerate which emails have accounts.
    return MessageResponse(message=GENERIC_FORGOT_PASSWORD_MESSAGE)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    invalid_detail = "This reset link is invalid or has expired. Please request a new one."
    user_repo = UserRepository(db)
    user = await user_repo.get_by_reset_token(payload.token)
    if (
        user is None
        or user.password_reset_token_expires_at is None
        or user.password_reset_token_expires_at < datetime.now(UTC)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=invalid_detail)

    await user_repo.set_password(user, hashed_password=hash_password(payload.new_password))
    await user_repo.set_reset_token(user, token=None, expires_at=None)
    await AuditLogRepository(db).create(
        organization_id=user.organization_id,
        user_id=user.id,
        action="password_reset",
        resource_type="user",
        resource_id=user.id,
    )
    await db.commit()
    return MessageResponse(message="Password reset successfully.")


async def _get_valid_invitation_or_400(token: str, db: AsyncSession) -> Invitation:
    invalid_detail = "This invitation link is invalid or has expired. Please ask your organization admin for a new one."
    invitation_repo = InvitationRepository(db)
    invitation = await invitation_repo.get_by_token(token)
    if invitation is None or invitation.status != InvitationStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=invalid_detail)

    if invitation.expires_at < datetime.now(UTC):
        await invitation_repo.mark_expired(invitation)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=invalid_detail)

    return invitation


async def _verify_transfer_password_or_400(existing_user: User, password: str) -> None:
    if not verify_password(password, existing_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password for the existing account with this email.",
        )


async def _check_transfer_blockers_or_blocked_response(
    db: AsyncSession, existing_user: User, old_organization
) -> AcceptInvitationBlockedResponse | None:
    """Re-verify server-side whether a transfer must be blocked.

    Sole-member orgs return a resolvable blocked payload; sole owners with other
    members still get a hard error."""
    user_repo = UserRepository(db)
    member_count = await user_repo.count_for_org(organization_id=existing_user.organization_id)
    if member_count == 1:
        return AcceptInvitationBlockedResponse(
            reason="sole_member",
            can_delete_and_transfer=True,
            current_organization_name=old_organization.name,
        )

    if existing_user.role == UserRole.OWNER:
        owner_count = await user_repo.count_by_role(
            organization_id=existing_user.organization_id, role=UserRole.OWNER
        )
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"You are the only owner of {old_organization.name}. Transfer ownership to "
                    "another member before leaving."
                ),
            )
    return None


@router.get("/invitations/{token}", response_model=InvitationPreview)
async def preview_invitation(token: str, db: AsyncSession = Depends(get_db)) -> InvitationPreview:
    invitation = await _get_valid_invitation_or_400(token, db)

    organization = await OrganizationRepository(db).get_by_id(invitation.organization_id)
    assert organization is not None

    # Re-derived live rather than trusting invitation.invitation_type: the account
    # this invitation was addressed to may have been transferred or deleted since
    # the invite was sent, up to INVITATION_EXPIRE_DAYS ago.
    existing_user = await UserRepository(db).get_by_email(invitation.email)
    is_transfer = existing_user is not None and existing_user.organization_id != invitation.organization_id

    current_organization_name = None
    if is_transfer:
        assert existing_user is not None
        current_org = await OrganizationRepository(db).get_by_id(existing_user.organization_id)
        current_organization_name = current_org.name if current_org is not None else None

    return InvitationPreview(
        email=invitation.email,
        organization_name=organization.name,
        role=invitation.role,
        invitation_type=InvitationType.TRANSFER if is_transfer else InvitationType.NEW_USER,
        current_organization_name=current_organization_name,
    )


@router.post("/accept-invitation", status_code=status.HTTP_201_CREATED, response_model=None)
async def accept_invitation(
    payload: AcceptInvitationRequest, db: AsyncSession = Depends(get_db)
) -> AuthResponse | JSONResponse:
    invitation = await _get_valid_invitation_or_400(payload.token, db)
    invitation_repo = InvitationRepository(db)
    user_repo = UserRepository(db)
    existing_user = await user_repo.get_by_email(invitation.email)

    organization = await OrganizationRepository(db).get_by_id(invitation.organization_id)
    assert organization is not None

    if existing_user is not None and existing_user.organization_id == invitation.organization_id:
        # Already a member of the org this invitation targets - nothing to do.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists"
        )

    if existing_user is not None:
        # --- Transfer path: this email has an account in a different org. Prove
        # control of it with its EXISTING password (never create a new one), then
        # move the account's membership rather than register a second account. ---
        await _verify_transfer_password_or_400(existing_user, payload.password)

        old_organization = await OrganizationRepository(db).get_by_id(existing_user.organization_id)
        assert old_organization is not None

        blocked = await _check_transfer_blockers_or_blocked_response(
            db, existing_user, old_organization
        )
        if blocked is not None:
            return JSONResponse(status_code=status.HTTP_200_OK, content=blocked.model_dump())

        old_organization_id = existing_user.organization_id
        await user_repo.transfer_to_org(
            existing_user, organization_id=invitation.organization_id, role=invitation.role
        )
        await invitation_repo.mark_accepted(invitation)
        # Two audit entries, one per organization, so each side has an independent
        # record of the transfer - not just one entry the old org can't see.
        await AuditLogRepository(db).create(
            organization_id=old_organization_id,
            user_id=existing_user.id,
            action="user_transferred_out",
            resource_type="user",
            resource_id=existing_user.id,
            extra_data={"to_organization": organization.name},
        )
        await AuditLogRepository(db).create(
            organization_id=invitation.organization_id,
            user_id=existing_user.id,
            action="user_transferred_in",
            resource_type="user",
            resource_id=existing_user.id,
            extra_data={"from_organization": old_organization.name},
        )
        await db.commit()
        return await _issue_auth_response(db, existing_user)

    # --- New-user path (unchanged behavior). ---
    if not payload.full_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Full name is required")

    try:
        user = await user_repo.create(
            organization_id=invitation.organization_id,
            email=invitation.email,
            hashed_password=hash_password(payload.password),
            full_name=payload.full_name,
            role=invitation.role,
        )
        await invitation_repo.mark_accepted(invitation)
        await AuditLogRepository(db).create(
            organization_id=invitation.organization_id,
            user_id=user.id,
            action="invitation_accepted",
            resource_type="invitation",
            resource_id=invitation.id,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to complete account setup") from None

    return await _issue_auth_response(db, user)


@router.post("/accept-invitation-with-deletion", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def accept_invitation_with_deletion(
    payload: AcceptInvitationWithDeletionRequest,
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> AuthResponse:
    invitation = await _get_valid_invitation_or_400(payload.token, db)
    invitation_repo = InvitationRepository(db)
    user_repo = UserRepository(db)
    org_repo = OrganizationRepository(db)
    existing_user = await user_repo.get_by_email(invitation.email)

    organization = await org_repo.get_by_id(invitation.organization_id)
    assert organization is not None

    if existing_user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No existing account found for this invitation email.",
        )

    if existing_user.organization_id == invitation.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists"
        )

    await _verify_transfer_password_or_400(existing_user, payload.password)

    old_organization = await org_repo.get_by_id(existing_user.organization_id)
    assert old_organization is not None

    member_count = await user_repo.count_for_org(organization_id=existing_user.organization_id)
    if member_count != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current organization has other members and cannot be deleted this way.",
        )

    if payload.confirm_organization_name != old_organization.name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization name confirmation does not match.",
        )

    old_organization_id = old_organization.id
    old_organization_name = old_organization.name
    deletion_timestamp = datetime.now(UTC).isoformat()

    user_email = existing_user.email
    user_full_name = existing_user.full_name
    user_hashed_password = existing_user.hashed_password
    user_totp_secret = existing_user.totp_secret
    user_totp_enabled = existing_user.totp_enabled
    user_backup_codes = existing_user.backup_codes

    if existing_user.avatar_storage_path:
        await storage.delete(existing_user.avatar_storage_path)

    await purge_organization_company_data(
        db, organization_id=old_organization_id, storage=storage
    )

    await AuditLogRepository(db).create(
        organization_id=invitation.organization_id,
        user_id=None,
        action="organization_deleted_via_transfer",
        resource_type="organization",
        resource_id=old_organization_id,
        extra_data={
            "old_organization_name": old_organization_name,
            "old_organization_id": str(old_organization_id),
            "deletion_timestamp": deletion_timestamp,
            "transferred_email": user_email,
        },
    )

    await user_repo.delete(existing_user)
    await org_repo.delete(old_organization)

    new_user = await user_repo.create(
        organization_id=invitation.organization_id,
        email=user_email,
        hashed_password=user_hashed_password,
        full_name=user_full_name,
        role=invitation.role,
    )
    if user_totp_enabled and user_totp_secret is not None:
        new_user.totp_secret = user_totp_secret
        new_user.totp_enabled = True
        new_user.backup_codes = user_backup_codes
        await db.flush()

    await invitation_repo.mark_accepted(invitation)
    await AuditLogRepository(db).create(
        organization_id=invitation.organization_id,
        user_id=new_user.id,
        action="invitation_accepted",
        resource_type="invitation",
        resource_id=invitation.id,
    )
    await db.commit()
    return await _issue_auth_response(db, new_user)


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
async def setup_2fa(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TwoFactorSetupResponse:
    if user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor authentication is already enabled"
        )

    secret = generate_totp_secret()
    await UserRepository(db).set_totp_secret(user, secret=secret)
    await db.commit()

    uri = get_totp_provisioning_uri(secret=secret, email=user.email)
    return TwoFactorSetupResponse(qr_code_base64=generate_qr_code_base64(uri), secret=secret)


@router.post("/2fa/verify-setup", response_model=BackupCodesResponse)
async def verify_setup_2fa(
    payload: VerifySetupRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BackupCodesResponse:
    if user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor authentication is already enabled"
        )
    if user.totp_secret is None or not verify_totp_code(secret=user.totp_secret, code=payload.totp_code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code, please try again.")

    backup_codes = generate_backup_codes()
    await UserRepository(db).enable_totp(user, hashed_backup_codes=hash_backup_codes(backup_codes))
    await AuditLogRepository(db).create(
        organization_id=user.organization_id,
        user_id=user.id,
        action="2fa_enabled",
        resource_type="user",
        resource_id=user.id,
    )
    await db.commit()
    return BackupCodesResponse(backup_codes=backup_codes)


@router.post("/2fa/disable", response_model=MessageResponse)
async def disable_2fa(
    payload: DisableTwoFactorRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    await UserRepository(db).disable_totp(user)
    await AuditLogRepository(db).create(
        organization_id=user.organization_id,
        user_id=user.id,
        action="2fa_disabled",
        resource_type="user",
        resource_id=user.id,
    )
    await db.commit()
    return MessageResponse(message="Two-factor authentication has been disabled.")


@router.post("/2fa/regenerate-backup-codes", response_model=BackupCodesResponse)
async def regenerate_backup_codes(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> BackupCodesResponse:
    if not user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor authentication is not enabled"
        )

    backup_codes = generate_backup_codes()
    await UserRepository(db).set_backup_codes(user, hashed_backup_codes=hash_backup_codes(backup_codes))
    await AuditLogRepository(db).create(
        organization_id=user.organization_id,
        user_id=user.id,
        action="2fa_backup_codes_regenerated",
        resource_type="user",
        resource_id=user.id,
    )
    await db.commit()
    return BackupCodesResponse(backup_codes=backup_codes)


@router.post("/2fa/login-verify", response_model=AuthResponse)
async def login_verify_2fa(payload: LoginVerifyRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    try:
        user_id = decode_pending_2fa_token(payload.pending_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_2FA_CODE_MESSAGE) from exc

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id_unscoped(user_id)
    if user is None or not user.is_active or not user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_2FA_CODE_MESSAGE)

    used_backup_code = False
    is_valid = False

    if payload.totp_code:
        is_valid = user.totp_secret is not None and verify_totp_code(
            secret=user.totp_secret, code=payload.totp_code
        )
    elif payload.backup_code:
        matched_hash = next(
            (h for h in (user.backup_codes or []) if verify_password(payload.backup_code, h)), None
        )
        if matched_hash is not None:
            await user_repo.remove_backup_code(user, hashed_code=matched_hash)
            is_valid = True
            used_backup_code = True

    if not is_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_2FA_CODE_MESSAGE)

    await AuditLogRepository(db).create(
        organization_id=user.organization_id,
        user_id=user.id,
        action="login_2fa_success",
        resource_type="user",
        resource_id=user.id,
        extra_data={"method": "backup_code" if used_backup_code else "totp"},
    )
    await db.commit()
    return await _issue_auth_response(db, user)
