import base64
import uuid
from datetime import UTC, datetime, timedelta

import pyotp
import pytest
from jose import jwt

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_pending_2fa_token,
    decode_access_token,
    decode_pending_2fa_token,
    generate_backup_codes,
    generate_qr_code_base64,
    generate_totp_secret,
    get_totp_provisioning_uri,
    hash_backup_codes,
    hash_password,
    verify_password,
    verify_totp_code,
)


class TestPasswordHashing:
    def test_verify_password_roundtrip(self):
        hashed = hash_password("correct-horse-battery-staple")
        assert verify_password("correct-horse-battery-staple", hashed)

    def test_verify_password_rejects_wrong_password(self):
        hashed = hash_password("correct-horse-battery-staple")
        assert not verify_password("wrong-password", hashed)

    def test_hash_password_is_salted(self):
        # Two hashes of the same plaintext must differ (bcrypt salts per call) -
        # otherwise identical passwords would be visibly identical in the DB.
        assert hash_password("same-password") != hash_password("same-password")


class TestAccessToken:
    def test_roundtrip_contains_expected_claims(self):
        user_id = uuid.uuid4()
        org_id = uuid.uuid4()
        token = create_access_token(user_id=user_id, org_id=org_id, role="OWNER")

        payload = decode_access_token(token)

        assert payload["sub"] == str(user_id)
        assert payload["org_id"] == str(org_id)
        assert payload["role"] == "OWNER"

    def test_expired_token_is_rejected(self):
        settings = get_settings()
        expired_payload = {
            "sub": str(uuid.uuid4()),
            "org_id": str(uuid.uuid4()),
            "role": "VIEWER",
            "exp": datetime.now(UTC) - timedelta(minutes=1),
        }
        token = jwt.encode(expired_payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

        with pytest.raises(ValueError):
            decode_access_token(token)

    def test_token_signed_with_wrong_secret_is_rejected(self):
        settings = get_settings()
        payload = {
            "sub": str(uuid.uuid4()),
            "org_id": str(uuid.uuid4()),
            "role": "VIEWER",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        }
        forged = jwt.encode(payload, "not-the-real-secret", algorithm=settings.jwt_algorithm)

        with pytest.raises(ValueError):
            decode_access_token(forged)

    def test_garbage_token_is_rejected(self):
        with pytest.raises(ValueError):
            decode_access_token("this-is-not-a-jwt")


class TestPending2FAToken:
    def test_roundtrip_returns_user_id(self):
        user_id = uuid.uuid4()
        token = create_pending_2fa_token(user_id=user_id)

        assert decode_pending_2fa_token(token) == user_id

    def test_regular_access_token_is_not_accepted_as_pending_2fa_token(self):
        # A pending-2FA token and a full access token are both just signed JWTs
        # sharing one secret - decode_pending_2fa_token must check the
        # `pending_2fa` claim itself, not just a valid signature, or a stolen
        # access token could be replayed to skip the 2FA verify step.
        access_token = create_access_token(user_id=uuid.uuid4(), org_id=uuid.uuid4(), role="OWNER")

        with pytest.raises(ValueError):
            decode_pending_2fa_token(access_token)

    def test_expired_pending_token_is_rejected(self):
        settings = get_settings()
        payload = {
            "sub": str(uuid.uuid4()),
            "pending_2fa": True,
            "exp": datetime.now(UTC) - timedelta(minutes=1),
        }
        token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

        with pytest.raises(ValueError):
            decode_pending_2fa_token(token)


class TestTotp:
    def test_generate_totp_secret_is_base32(self):
        secret = generate_totp_secret()
        assert len(secret) == 32
        # base32 alphabet check - decoding raises if it isn't valid base32.
        pyotp.totp.TOTP(secret).now()

    def test_provisioning_uri_contains_issuer_and_email(self):
        uri = get_totp_provisioning_uri(secret=generate_totp_secret(), email="board@example.com")
        assert "board%40example.com" in uri or "board@example.com" in uri
        assert "Assiduous" in uri

    def test_verify_totp_code_accepts_current_code(self):
        secret = generate_totp_secret()
        current_code = pyotp.totp.TOTP(secret).now()
        assert verify_totp_code(secret=secret, code=current_code)

    def test_verify_totp_code_rejects_wrong_code(self):
        secret = generate_totp_secret()
        totp = pyotp.totp.TOTP(secret)
        current = totp.now()
        # Guaranteed-wrong 6-digit code distinct from the real one.
        wrong = "000000" if current != "000000" else "111111"
        assert not verify_totp_code(secret=secret, code=wrong)

    def test_generate_qr_code_base64_is_a_png(self):
        uri = get_totp_provisioning_uri(secret=generate_totp_secret(), email="board@example.com")
        encoded = generate_qr_code_base64(uri)
        png_bytes = base64.b64decode(encoded)
        assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"


class TestBackupCodes:
    def test_generate_backup_codes_returns_unique_codes(self):
        codes = generate_backup_codes()
        assert len(codes) == 10
        assert len(set(codes)) == 10
        for code in codes:
            assert len(code) == 9  # "XXXX-XXXX"
            assert code[4] == "-"

    def test_generate_backup_codes_respects_count(self):
        assert len(generate_backup_codes(count=3)) == 3

    def test_hash_backup_codes_are_individually_verifiable(self):
        codes = generate_backup_codes(count=3)
        hashed = hash_backup_codes(codes)

        assert len(hashed) == 3
        assert all(verify_password(plain, h) for plain, h in zip(codes, hashed, strict=True))
        # Hashes must not equal the plaintext, and must not collide with each other.
        assert len(set(hashed)) == 3
