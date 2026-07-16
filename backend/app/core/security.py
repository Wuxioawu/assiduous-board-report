import base64
import io
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pyotp
import qrcode
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

TOTP_ISSUER_NAME = "Assiduous Board Report"
BACKUP_CODE_COUNT = 10
PENDING_2FA_TOKEN_EXPIRE_MINUTES = 5

# Fixed hash to compare against when the account being logged into doesn't
# exist. bcrypt verification is deliberately slow (that's what makes it
# resistant to offline brute-forcing), so skipping it for an unknown email
# would make that request return noticeably faster than a known email with a
# wrong password - an attacker can enumerate valid accounts from response
# time alone even though the error message is identical. Always paying the
# same bcrypt cost keeps the two cases indistinguishable. Computed once at
# import time rather than hardcoded so it tracks whatever scheme/cost factor
# _pwd_context is configured with.
_DUMMY_PASSWORD_HASH = _pwd_context.hash("dummy-password-for-timing-normalization")


def hash_password(plain_password: str) -> str:
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _pwd_context.verify(plain_password, hashed_password)


def verify_password_or_dummy(plain_password: str, hashed_password: str | None) -> bool:
    """Same as verify_password, but safe to call with hashed_password=None (no
    such account) - always runs a real bcrypt comparison, against a fixed
    dummy hash in that case, so callers get a uniform latency profile
    regardless of whether the account exists. See _DUMMY_PASSWORD_HASH."""
    return _pwd_context.verify(plain_password, hashed_password or _DUMMY_PASSWORD_HASH)


def create_access_token(*, user_id: UUID, org_id: UUID, role: str) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "org_id": str(org_id),
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc


def create_pending_2fa_token(*, user_id: UUID) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=PENDING_2FA_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "pending_2fa": True, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_pending_2fa_token(token: str) -> UUID:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc
    if payload.get("pending_2fa") is not True:
        raise ValueError("Not a valid pending 2FA token")
    return UUID(payload["sub"])


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_totp_provisioning_uri(*, secret: str, email: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=TOTP_ISSUER_NAME)


def generate_qr_code_base64(uri: str) -> str:
    image = qrcode.make(uri)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def verify_totp_code(*, secret: str, code: str) -> bool:
    return pyotp.totp.TOTP(secret).verify(code, valid_window=1)


def generate_backup_codes(count: int = BACKUP_CODE_COUNT) -> list[str]:
    return [f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}" for _ in range(count)]


def hash_backup_codes(codes: list[str]) -> list[str]:
    return [hash_password(code) for code in codes]
