import uuid

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import UserRole


class UserRead(BaseModel):
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


class AvatarResponse(BaseModel):
    avatar_url: str | None
