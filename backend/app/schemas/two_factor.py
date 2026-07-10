from pydantic import BaseModel, Field


class TwoFactorSetupResponse(BaseModel):
    qr_code_base64: str
    secret: str


class VerifySetupRequest(BaseModel):
    totp_code: str = Field(min_length=6, max_length=6)


class BackupCodesResponse(BaseModel):
    backup_codes: list[str]


class DisableTwoFactorRequest(BaseModel):
    current_password: str


class PendingTwoFactorResponse(BaseModel):
    requires_2fa: bool = True
    pending_token: str


class LoginVerifyRequest(BaseModel):
    pending_token: str
    totp_code: str | None = None
    backup_code: str | None = None
