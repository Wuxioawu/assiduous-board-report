import uuid

from pydantic import ConfigDict, EmailStr

from app.models.enums import UserRole
from app.schemas.base import AppBaseModel


class UserRead(AppBaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    totp_enabled: bool
    avatar_url: str | None = None


class AvatarResponse(AppBaseModel):
    avatar_url: str | None
