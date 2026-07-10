import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDPKMixin
from app.models.enums import InvitationStatus, InvitationType, UserRole


class Invitation(UUIDPKMixin, CreatedAtMixin, Base):
    __tablename__ = "invitation"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    status: Mapped[InvitationStatus] = mapped_column(
        Enum(InvitationStatus, name="invitation_status"), nullable=False, default=InvitationStatus.PENDING
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Snapshot at creation time of whether the email had an existing account in a
    # different organization - drives the invitation email wording. The accept
    # endpoint re-derives the live state independently rather than trusting this
    # flag, since account state can change during the (up to 7-day) invite window.
    invitation_type: Mapped[InvitationType] = mapped_column(
        Enum(InvitationType, name="invitation_type"), nullable=False, default=InvitationType.NEW_USER
    )
