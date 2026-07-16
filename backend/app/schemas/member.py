import uuid
from datetime import datetime

from pydantic import ConfigDict, EmailStr

from app.models.enums import UserRole
from app.schemas.base import AppBaseModel


class MemberRead(AppBaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    avatar_url: str | None = None


class MemberRoleUpdate(AppBaseModel):
    role: UserRole
