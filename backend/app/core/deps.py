import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.audit_log import AuditLogRepository
from app.repositories.user import UserRepository

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    """Authenticated request context. Every downstream query MUST be
    scoped by org_id to keep row-level tenant isolation."""

    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str
    user: User


def _unauthorized(detail: str = "Could not validate credentials") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_tenant_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    if credentials is None:
        raise _unauthorized("Missing authentication token")

    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise _unauthorized(str(exc)) from exc

    user_id = payload.get("sub")
    org_id = payload.get("org_id")
    role = payload.get("role")
    if user_id is None or org_id is None or role is None:
        raise _unauthorized("Malformed token payload")

    # The JWT's role claim is fixed at issuance and never reissued when a role
    # changes mid-session - whether the user changed their own role or an
    # OWNER/ADMIN changed it for them elsewhere. Trusting the claim directly
    # would let a promoted user stay wrongly blocked (this bug report) or a
    # demoted user wrongly keep their old permissions (a real security gap)
    # until the token expires. Re-check the live DB role on every request
    # instead, so a role change takes effect immediately regardless of who
    # made it or whether the affected user is mid-session elsewhere.
    user = await UserRepository(db).get_by_id(uuid.UUID(user_id), organization_id=uuid.UUID(org_id))
    if user is None or not user.is_active:
        raise _unauthorized("User not found or inactive")

    return TenantContext(user_id=user.id, org_id=user.organization_id, role=user.role.value, user=user)


async def get_current_user(tenant: TenantContext = Depends(get_tenant_context)) -> User:
    return tenant.user


async def get_or_404[T](getter: Callable[[], Awaitable[T | None]], *, detail: str) -> T:
    """Awaits `getter()` and raises a 404 with `detail` if it returns None.

    Replaces the "fetch a tenant-scoped resource, 404 if missing" pattern that
    was copied nearly verbatim across companies.py, comments.py, budgets.py,
    documents.py, insights.py, financial_statements.py, and metrics.py (some as
    a local `_get_owned_company_or_404` helper, others inlined). Usage:

        company = await get_or_404(
            lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
            detail="Company not found",
        )
    """
    entity = await getter()
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return entity


async def create_audit_log(
    db: AsyncSession,
    tenant: TenantContext,
    *,
    action: str,
    resource_type: str | None = None,
    resource_id: uuid.UUID | None = None,
    extra_data: dict | None = None,
) -> AuditLog:
    """Thin convenience wrapper around AuditLogRepository.create that pulls
    organization_id/user_id from the request's TenantContext - eliminates the
    `organization_id=tenant.org_id, user_id=tenant.user_id` boilerplate that was
    repeated at ~30 call sites across every route module. Callers still own
    their own `db.commit()` afterward - timing varies (some routes bundle the
    audit entry into a larger multi-step commit), so this doesn't commit for
    them.
    """
    return await AuditLogRepository(db).create(
        organization_id=tenant.org_id,
        user_id=tenant.user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        extra_data=extra_data,
    )


def require_role(*allowed_roles: UserRole):
    """FastAPI dependency factory: 403s unless the caller's role is one of
    allowed_roles. Use as Depends(require_role(UserRole.OWNER, UserRole.ADMIN))."""

    async def checker(tenant: TenantContext = Depends(get_tenant_context)) -> TenantContext:
        if UserRole(tenant.role) not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return tenant

    return checker
