import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.repositories.user import UserRepository

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    """Authenticated request context. Every downstream query MUST be
    scoped by org_id to keep row-level tenant isolation."""

    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str


def _unauthorized(detail: str = "Could not validate credentials") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_tenant_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
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

    return TenantContext(user_id=uuid.UUID(user_id), org_id=uuid.UUID(org_id), role=role)


async def get_current_user(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await UserRepository(db).get_by_id(tenant.user_id, organization_id=tenant.org_id)
    if user is None or not user.is_active:
        raise _unauthorized("User not found or inactive")
    return user
