import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import InvitationStatus, InvitationType, UserRole


class InvitationCreate(BaseModel):
    email: EmailStr
    role: UserRole


class InvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: UserRole
    status: InvitationStatus
    invitation_type: InvitationType
    invited_by_user_id: uuid.UUID | None
    expires_at: datetime
    created_at: datetime
    email_sent: bool = True


class InviteEligibility(BaseModel):
    """Read-only pre-check the frontend calls before actually creating an
    invitation, so it can show a transfer-confirmation prompt without side effects."""

    invitation_type: InvitationType
    current_organization_name: str | None = None


class InvitationPreview(BaseModel):
    """Public, pre-auth summary of an invitation - shown on the accept-invitation
    page before the user picks a registration form or a login-to-confirm form."""

    email: str
    organization_name: str
    role: UserRole
    invitation_type: InvitationType
    current_organization_name: str | None = None


class AcceptInvitationRequest(BaseModel):
    token: str
    # Only required for a brand-new account (invitation_type=new_user) - a transfer
    # keeps the existing account's name, so the frontend doesn't collect it there.
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    # New-user path: the password to set on the new account.
    # Transfer path: the existing account's current password, used to prove
    # control of it rather than to change anything.
    password: str = Field(min_length=8, max_length=128)


class AcceptInvitationBlockedResponse(BaseModel):
    """Returned when a transfer invitation cannot complete immediately but offers
    an inline resolution path (e.g. sole-member org deletion)."""

    blocked: bool = True
    reason: str
    can_delete_and_transfer: bool
    current_organization_name: str


class AcceptInvitationWithDeletionRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)
    confirm_organization_name: str = Field(min_length=1, max_length=255)
