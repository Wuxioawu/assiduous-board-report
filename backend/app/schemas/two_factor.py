from pydantic import Field

from app.schemas.base import AppBaseModel


class TwoFactorSetupResponse(AppBaseModel):
    qr_code_base64: str
    secret: str


class VerifySetupRequest(AppBaseModel):
    totp_code: str = Field(min_length=6, max_length=6)


class BackupCodesResponse(AppBaseModel):
    backup_codes: list[str]


class DisableTwoFactorRequest(AppBaseModel):
    current_password: str


class PendingTwoFactorResponse(AppBaseModel):
    requires_2fa: bool = True
    pending_token: str


class LoginVerifyRequest(AppBaseModel):
    pending_token: str
    totp_code: str | None = None
    backup_code: str | None = None
