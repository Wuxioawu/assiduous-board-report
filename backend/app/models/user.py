import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import UserRole


class User(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "user"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), nullable=False, default=UserRole.VIEWER
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    password_reset_token: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    password_reset_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Phase 2 hardening item: encrypt at rest (e.g. envelope-encrypt with a
    # KMS-backed key) instead of storing the raw TOTP secret in plaintext.
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Bcrypt-hashed one-time recovery codes, same hashing as passwords; never
    # stored in plaintext once issued to the user.
    backup_codes: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    # Public-facing URL the frontend loads (GET /api/v1/users/{id}/avatar) - stable
    # across re-uploads, so nothing else needs updating when a user changes their photo.
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Internal filesystem/object-storage key (mirrors Document.storage_path) used to
    # serve and delete the file; never exposed directly via the API.
    avatar_storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
