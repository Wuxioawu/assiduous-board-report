import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import UserRole
from app.models.user import User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        email: str,
        hashed_password: str,
        full_name: str,
        role: UserRole = UserRole.OWNER,
    ) -> User:
        user = User(
            organization_id=organization_id,
            email=email,
            hashed_password=hashed_password,
            full_name=full_name,
            role=role,
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def get_by_email(self, email: str) -> User | None:
        # Pre-authentication lookup: tenant (org_id) is not yet known, so this
        # is the one repository method intentionally not filtered by organization_id.
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: uuid.UUID, *, organization_id: uuid.UUID) -> User | None:
        result = await self.session.execute(
            select(User).where(User.id == user_id, User.organization_id == organization_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_unscoped(self, user_id: uuid.UUID) -> User | None:
        # Pre-authentication lookup, like get_by_email: used only mid-login
        # (2FA verification), where the tenant isn't yet established.
        return await self.session.get(User, user_id)

    async def get_by_reset_token(self, token: str) -> User | None:
        # Pre-authentication lookup, like get_by_email: tenant is not yet known.
        result = await self.session.execute(select(User).where(User.password_reset_token == token))
        return result.scalar_one_or_none()

    async def set_password(self, user: User, *, hashed_password: str) -> None:
        user.hashed_password = hashed_password
        await self.session.flush()

    async def set_reset_token(
        self, user: User, *, token: str | None, expires_at: datetime | None
    ) -> None:
        user.password_reset_token = token
        user.password_reset_token_expires_at = expires_at
        await self.session.flush()

    async def list_for_org(self, *, organization_id: uuid.UUID) -> list[User]:
        result = await self.session.execute(
            select(User).where(User.organization_id == organization_id).order_by(User.created_at)
        )
        return list(result.scalars().all())

    async def count_by_role(self, *, organization_id: uuid.UUID, role: UserRole) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(User)
            .where(User.organization_id == organization_id, User.role == role)
        )
        return result.scalar_one()

    async def count_for_org(self, *, organization_id: uuid.UUID) -> int:
        result = await self.session.execute(
            select(func.count()).select_from(User).where(User.organization_id == organization_id)
        )
        return result.scalar_one()

    async def set_role(self, user: User, *, role: UserRole) -> None:
        user.role = role
        await self.session.flush()

    async def transfer_to_org(self, user: User, *, organization_id: uuid.UUID, role: UserRole) -> None:
        # Moves the user's membership wholesale - a user belongs to exactly one
        # organization at a time, never both simultaneously. Historical rows
        # (FinancialStatement, AuditLog, Comment, ...) keyed by this user_id keep
        # their own organization_id as recorded, so old-org history stays intact.
        user.organization_id = organization_id
        user.role = role
        await self.session.flush()

    async def delete(self, user: User) -> None:
        await self.session.delete(user)
        await self.session.flush()

    async def set_totp_secret(self, user: User, *, secret: str | None) -> None:
        user.totp_secret = secret
        await self.session.flush()

    async def enable_totp(self, user: User, *, hashed_backup_codes: list[str]) -> None:
        user.totp_enabled = True
        user.backup_codes = hashed_backup_codes
        await self.session.flush()

    async def disable_totp(self, user: User) -> None:
        user.totp_secret = None
        user.totp_enabled = False
        user.backup_codes = None
        await self.session.flush()

    async def set_backup_codes(self, user: User, *, hashed_backup_codes: list[str]) -> None:
        user.backup_codes = hashed_backup_codes
        await self.session.flush()

    async def remove_backup_code(self, user: User, *, hashed_code: str) -> None:
        user.backup_codes = [c for c in (user.backup_codes or []) if c != hashed_code]
        await self.session.flush()

    async def set_avatar(self, user: User, *, avatar_url: str, avatar_storage_path: str) -> None:
        user.avatar_url = avatar_url
        user.avatar_storage_path = avatar_storage_path
        await self.session.flush()

    async def clear_avatar(self, user: User) -> None:
        user.avatar_url = None
        user.avatar_storage_path = None
        await self.session.flush()
