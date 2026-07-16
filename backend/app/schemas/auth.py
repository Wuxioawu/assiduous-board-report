from pydantic import EmailStr, Field

from app.schemas.base import AppBaseModel
from app.schemas.token import Token
from app.schemas.user import UserRead


class RegisterRequest(AppBaseModel):
    organization_name: str = Field(min_length=1, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(AppBaseModel):
    email: EmailStr
    password: str


class AuthResponse(AppBaseModel):
    token: Token
    user: UserRead


class ChangePasswordRequest(AppBaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(AppBaseModel):
    email: EmailStr


class ResetPasswordRequest(AppBaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class MessageResponse(AppBaseModel):
    message: str
