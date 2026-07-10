import uuid
from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.enums import UserRole
from app.models.organization import Organization
from app.models.user import User
from app.repositories.organization import OrganizationRepository
from app.repositories.user import UserRepository


async def create_user(
    db,
    *,
    organization_id: uuid.UUID,
    role: UserRole,
    email: str | None = None,
    password: str = "password123",
    full_name: str = "Test User",
) -> User:
    suffix = uuid.uuid4().hex[:8]
    user = await UserRepository(db).create(
        organization_id=organization_id,
        email=email or f"user-{suffix}@example.com",
        hashed_password=hash_password(password),
        full_name=full_name,
        role=role,
    )
    await db.flush()
    return user


async def create_org_with_user(
    db,
    *,
    role: UserRole,
    org_name: str | None = None,
    email: str | None = None,
    password: str = "password123",
) -> tuple[Organization, User]:
    suffix = uuid.uuid4().hex[:8]
    org = await OrganizationRepository(db).create(name=org_name or f"Org-{suffix}", slug=f"org-{suffix}")
    user = await create_user(db, organization_id=org.id, role=role, email=email, password=password)
    return org, user


def auth_headers(user: User, org: Organization) -> dict[str, str]:
    token = create_access_token(user_id=user.id, org_id=org.id, role=user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
