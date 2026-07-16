import logging
import uuid

import pyotp
import pytest
from httpx import AsyncClient

import app.api.v1.routes.auth as auth_routes
from app.db.session import AsyncSessionLocal
from app.models.enums import UserRole
from app.repositories.user import UserRepository
from tests.conftest import create_org_with_user

pytestmark = pytest.mark.asyncio


def _register_payload(**overrides) -> dict:
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "organization_name": f"Org-{suffix}",
        "full_name": "Test User",
        "email": f"user-{suffix}@example.com",
        "password": "password123",
    }
    payload.update(overrides)
    return payload


class TestRegister:
    async def test_register_creates_org_and_owner(self, client: AsyncClient):
        payload = _register_payload()

        response = await client.post("/api/v1/auth/register", json=payload)

        assert response.status_code == 201
        body = response.json()
        assert body["token"]["access_token"]
        assert body["user"]["email"] == payload["email"]
        assert body["user"]["role"] == "owner"
        assert body["user"]["organization_name"] == payload["organization_name"]

    async def test_register_duplicate_email_rejected(self, client: AsyncClient):
        payload = _register_payload()
        first = await client.post("/api/v1/auth/register", json=payload)
        assert first.status_code == 201

        second = await client.post("/api/v1/auth/register", json=_register_payload(email=payload["email"]))

        assert second.status_code == 400


class TestLogin:
    async def test_login_success(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()

        response = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "password123"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["token"]["access_token"]
        assert body["user"]["email"] == user.email

    async def test_login_wrong_password_rejected(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()

        response = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "wrong-password"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Incorrect email or password."

    async def test_login_unknown_email_rejected(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "password123"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Incorrect email or password."

    async def test_login_inactive_user_rejected(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            user.is_active = False
            await db.flush()
            await db.commit()

        response = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "password123"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Incorrect email or password."

    async def test_login_failure_reason_is_logged_but_not_returned_to_client(
        self, client: AsyncClient, caplog: pytest.LogCaptureFixture
    ):
        """The three failure reasons must be indistinguishable to the caller
        (same status/message - see the three tests above) but still
        distinguishable in server logs, so we can debug login issues without
        exposing account existence to an unauthenticated client."""
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()

        with caplog.at_level(logging.INFO, logger="app.auth"):
            await client.post(
                "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "password123"}
            )
            await client.post(
                "/api/v1/auth/login", json={"email": user.email, "password": "wrong-password"}
            )

        messages = [record.message for record in caplog.records]
        assert any("reason=unknown_email" in m for m in messages)
        assert any("reason=bad_password" in m for m in messages)

    async def test_login_unknown_email_still_runs_password_hash_check(self, client: AsyncClient, monkeypatch):
        """Guards against re-introducing the timing side-channel: the
        unknown-email branch must still call into the bcrypt verifier (even
        though it compares against a dummy hash) rather than short-circuiting
        before any hashing work happens."""
        calls = []
        real_verify = auth_routes.verify_password_or_dummy

        def spy(plain_password, hashed_password):
            calls.append(hashed_password)
            return real_verify(plain_password, hashed_password)

        monkeypatch.setattr(auth_routes, "verify_password_or_dummy", spy)

        await client.post(
            "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "password123"}
        )

        assert calls == [None]

    async def test_login_with_2fa_enabled_returns_pending_token(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            user.totp_secret = pyotp.random_base32()
            user.totp_enabled = True
            await db.flush()
            await db.commit()

        response = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "password123"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["requires_2fa"] is True
        assert body["pending_token"]
        assert "token" not in body


class TestGetMe:
    async def test_requires_authentication(self, client: AsyncClient):
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401

    async def test_returns_current_user(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()

        login = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "password123"}
        )
        token = login.json()["token"]["access_token"]

        response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 200
        assert response.json()["email"] == user.email


class TestChangePassword:
    async def test_success_allows_login_with_new_password_only(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="old-password1")
            await db.commit()
        login = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "old-password1"}
        )
        headers = {"Authorization": f"Bearer {login.json()['token']['access_token']}"}

        response = await client.post(
            "/api/v1/auth/change-password",
            headers=headers,
            json={"current_password": "old-password1", "new_password": "new-password1"},
        )
        assert response.status_code == 200

        old_login = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "old-password1"}
        )
        assert old_login.status_code == 401

        new_login = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "new-password1"}
        )
        assert new_login.status_code == 200

    async def test_wrong_current_password_rejected(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="old-password1")
            await db.commit()
        login = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "old-password1"}
        )
        headers = {"Authorization": f"Bearer {login.json()['token']['access_token']}"}

        response = await client.post(
            "/api/v1/auth/change-password",
            headers=headers,
            json={"current_password": "not-the-current-password", "new_password": "new-password1"},
        )

        assert response.status_code == 400


class TestForgotAndResetPassword:
    async def test_forgot_password_existing_user_persists_reset_token(
        self, client: AsyncClient, monkeypatch
    ):
        sent_to = []
        monkeypatch.setattr(
            "app.api.v1.routes.auth.send_email",
            lambda to, subject, html_body: sent_to.append(to) or _true_coro(),
        )

        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()

        response = await client.post("/api/v1/auth/forgot-password", json={"email": user.email})

        assert response.status_code == 200
        assert sent_to == [user.email]

        async with AsyncSessionLocal() as db:
            refreshed = await UserRepository(db).get_by_email(user.email)
            assert refreshed.password_reset_token is not None
            assert refreshed.password_reset_token_expires_at is not None

    async def test_forgot_password_unknown_email_returns_same_generic_message_and_sends_nothing(
        self, client: AsyncClient, monkeypatch
    ):
        called = []
        monkeypatch.setattr(
            "app.api.v1.routes.auth.send_email",
            lambda to, subject, html_body: called.append(to) or _true_coro(),
        )

        known = await client.post("/api/v1/auth/forgot-password", json={"email": "unknown@example.com"})

        assert known.status_code == 200
        assert called == []

    async def test_reset_password_with_valid_token_succeeds(self, client: AsyncClient, monkeypatch):
        monkeypatch.setattr(
            "app.api.v1.routes.auth.send_email", lambda to, subject, html_body: _true_coro()
        )
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="old-password1")
            await db.commit()

        await client.post("/api/v1/auth/forgot-password", json={"email": user.email})
        async with AsyncSessionLocal() as db:
            refreshed = await UserRepository(db).get_by_email(user.email)
            reset_token = refreshed.password_reset_token

        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": reset_token, "new_password": "new-password1"},
        )
        assert response.status_code == 200

        old_login = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "old-password1"}
        )
        assert old_login.status_code == 401
        new_login = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "new-password1"}
        )
        assert new_login.status_code == 200

    async def test_reset_password_with_expired_token_rejected(self, client: AsyncClient):
        from datetime import UTC, datetime, timedelta

        expired_token = f"expired-{uuid.uuid4().hex}"
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await UserRepository(db).set_reset_token(
                user, token=expired_token, expires_at=datetime.now(UTC) - timedelta(minutes=1)
            )
            await db.commit()

        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": expired_token, "new_password": "new-password1"},
        )

        assert response.status_code == 400

    async def test_reset_password_with_invalid_token_rejected(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": "this-token-does-not-exist", "new_password": "new-password1"},
        )

        assert response.status_code == 400


async def _true_coro():
    return True


class TestTwoFactorSetupFlow:
    async def _login_headers(
        self, client: AsyncClient, email: str, password: str = "password123", *, totp_secret: str | None = None
    ) -> dict:
        login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
        body = login.json()
        if "pending_token" in body:
            # User already has 2FA enabled - login() only returns a pending
            # token, so the real access token requires completing the verify
            # step with a fresh TOTP code from the caller-supplied secret.
            assert totp_secret is not None, "user has 2FA enabled but no totp_secret was provided"
            verify = await client.post(
                "/api/v1/auth/2fa/login-verify",
                json={"pending_token": body["pending_token"], "totp_code": pyotp.totp.TOTP(totp_secret).now()},
            )
            body = verify.json()
        return {"Authorization": f"Bearer {body['token']['access_token']}"}

    async def test_setup_returns_secret_and_qr_code(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()
        headers = await self._login_headers(client, user.email)

        response = await client.post("/api/v1/auth/2fa/setup", headers=headers)

        assert response.status_code == 200
        body = response.json()
        assert body["secret"]
        assert body["qr_code_base64"]

    async def test_setup_when_already_enabled_rejected(self, client: AsyncClient):
        secret = pyotp.random_base32()
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            user.totp_secret = secret
            user.totp_enabled = True
            await db.flush()
            await db.commit()
        headers = await self._login_headers(client, user.email, totp_secret=secret)

        response = await client.post("/api/v1/auth/2fa/setup", headers=headers)

        assert response.status_code == 400

    async def test_verify_setup_with_valid_code_enables_2fa_and_returns_backup_codes(
        self, client: AsyncClient
    ):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()
        headers = await self._login_headers(client, user.email)
        setup = await client.post("/api/v1/auth/2fa/setup", headers=headers)
        secret = setup.json()["secret"]
        code = pyotp.totp.TOTP(secret).now()

        response = await client.post(
            "/api/v1/auth/2fa/verify-setup", headers=headers, json={"totp_code": code}
        )

        assert response.status_code == 200
        backup_codes = response.json()["backup_codes"]
        assert len(backup_codes) == 10

        async with AsyncSessionLocal() as db:
            refreshed = await UserRepository(db).get_by_email(user.email)
            assert refreshed.totp_enabled is True

    async def test_verify_setup_with_wrong_code_rejected(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()
        headers = await self._login_headers(client, user.email)
        await client.post("/api/v1/auth/2fa/setup", headers=headers)

        response = await client.post(
            "/api/v1/auth/2fa/verify-setup", headers=headers, json={"totp_code": "000000"}
        )

        assert response.status_code == 400

    async def test_disable_requires_correct_password(self, client: AsyncClient):
        secret = pyotp.random_base32()
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            user.totp_secret = secret
            user.totp_enabled = True
            await db.flush()
            await db.commit()
        headers = await self._login_headers(client, user.email, totp_secret=secret)

        wrong = await client.post(
            "/api/v1/auth/2fa/disable", headers=headers, json={"current_password": "not-it"}
        )
        assert wrong.status_code == 400

        correct = await client.post(
            "/api/v1/auth/2fa/disable", headers=headers, json={"current_password": "password123"}
        )
        assert correct.status_code == 200

        async with AsyncSessionLocal() as db:
            refreshed = await UserRepository(db).get_by_email(user.email)
            assert refreshed.totp_enabled is False
            assert refreshed.totp_secret is None

    async def test_regenerate_backup_codes_requires_2fa_enabled(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()
        headers = await self._login_headers(client, user.email)

        response = await client.post("/api/v1/auth/2fa/regenerate-backup-codes", headers=headers)

        assert response.status_code == 400

    async def test_regenerate_backup_codes_invalidates_old_codes(self, client: AsyncClient):
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()
        headers = await self._login_headers(client, user.email)
        setup = await client.post("/api/v1/auth/2fa/setup", headers=headers)
        secret = setup.json()["secret"]
        verify = await client.post(
            "/api/v1/auth/2fa/verify-setup",
            headers=headers,
            json={"totp_code": pyotp.totp.TOTP(secret).now()},
        )
        old_backup_code = verify.json()["backup_codes"][0]

        regenerated = await client.post("/api/v1/auth/2fa/regenerate-backup-codes", headers=headers)
        assert regenerated.status_code == 200
        new_codes = regenerated.json()["backup_codes"]
        assert old_backup_code not in new_codes

        login = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "password123"}
        )
        pending_token = login.json()["pending_token"]
        replay = await client.post(
            "/api/v1/auth/2fa/login-verify",
            json={"pending_token": pending_token, "backup_code": old_backup_code},
        )
        assert replay.status_code == 401


class TestLoginVerify2FA:
    async def _create_2fa_user(self, client: AsyncClient) -> tuple[str, str, list[str]]:
        async with AsyncSessionLocal() as db:
            org, user = await create_org_with_user(db, role=UserRole.OWNER, password="password123")
            await db.commit()
        login = await client.post(
            "/api/v1/auth/login", json={"email": user.email, "password": "password123"}
        )
        headers = {"Authorization": f"Bearer {login.json()['token']['access_token']}"}
        setup = await client.post("/api/v1/auth/2fa/setup", headers=headers)
        secret = setup.json()["secret"]
        verify = await client.post(
            "/api/v1/auth/2fa/verify-setup",
            headers=headers,
            json={"totp_code": pyotp.totp.TOTP(secret).now()},
        )
        backup_codes = verify.json()["backup_codes"]
        return user.email, secret, backup_codes

    async def test_valid_totp_code_completes_login(self, client: AsyncClient):
        email, secret, _ = await self._create_2fa_user(client)

        login = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
        pending_token = login.json()["pending_token"]

        response = await client.post(
            "/api/v1/auth/2fa/login-verify",
            json={"pending_token": pending_token, "totp_code": pyotp.totp.TOTP(secret).now()},
        )

        assert response.status_code == 200
        assert response.json()["user"]["email"] == email

    async def test_invalid_totp_code_rejected(self, client: AsyncClient):
        email, secret, _ = await self._create_2fa_user(client)
        login = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
        pending_token = login.json()["pending_token"]

        response = await client.post(
            "/api/v1/auth/2fa/login-verify",
            json={"pending_token": pending_token, "totp_code": "000000"},
        )

        assert response.status_code == 401

    async def test_backup_code_completes_login_and_is_single_use(self, client: AsyncClient):
        email, secret, backup_codes = await self._create_2fa_user(client)
        code = backup_codes[0]

        login = await client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
        first = await client.post(
            "/api/v1/auth/2fa/login-verify",
            json={"pending_token": login.json()["pending_token"], "backup_code": code},
        )
        assert first.status_code == 200

        login_again = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": "password123"}
        )
        second = await client.post(
            "/api/v1/auth/2fa/login-verify",
            json={"pending_token": login_again.json()["pending_token"], "backup_code": code},
        )
        assert second.status_code == 401

    async def test_garbage_pending_token_rejected(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/auth/2fa/login-verify",
            json={"pending_token": "not-a-real-token", "totp_code": "123456"},
        )

        assert response.status_code == 401
