import secrets
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.main import app
from app.models.audit_log import AuditLog
from app.models.company import Company
from app.models.document import Document
from app.models.enums import DocumentStatus, InvitationStatus, UserRole
from app.models.invitation import Invitation
from app.models.organization import Organization
from app.models.user import User
from app.repositories.company import CompanyRepository
from app.repositories.invitation import InvitationRepository
from app.repositories.organization import OrganizationRepository
from app.repositories.user import UserRepository


async def _create_org_with_owner(
    db,
    *,
    org_name: str,
    email: str,
    password: str = "password123",
    full_name: str = "Test User",
) -> tuple[Organization, User]:
    org_repo = OrganizationRepository(db)
    user_repo = UserRepository(db)
    slug = f"test-{uuid.uuid4().hex[:8]}"
    org = await org_repo.create(name=org_name, slug=slug)
    user = await user_repo.create(
        organization_id=org.id,
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        role=UserRole.OWNER,
    )
    await db.flush()
    return org, user


async def _create_transfer_invitation(
    db,
    *,
    target_org_id: uuid.UUID,
    email: str,
    invited_by_user_id: uuid.UUID,
) -> Invitation:
    token = secrets.token_urlsafe(32)
    invitation = await InvitationRepository(db).create(
        organization_id=target_org_id,
        email=email,
        role=UserRole.ANALYST,
        invited_by_user_id=invited_by_user_id,
        token=token,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    await db.flush()
    return invitation


@pytest.mark.asyncio
async def test_sole_member_accept_returns_blocked_payload():
    async with AsyncSessionLocal() as db_session:
        old_org, sole_user = await _create_org_with_owner(
            db_session, org_name="UCD", email=f"ucd-{uuid.uuid4().hex[:8]}@example.com"
        )
        new_org, inviter = await _create_org_with_owner(
            db_session, org_name="Xiaomi", email=f"xiaomi-{uuid.uuid4().hex[:8]}@example.com"
        )
        invitation = await _create_transfer_invitation(
            db_session,
            target_org_id=new_org.id,
            email=sole_user.email,
            invited_by_user_id=inviter.id,
        )
        await db_session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/accept-invitation",
                json={"token": invitation.token, "password": "password123"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body == {
            "blocked": True,
            "reason": "sole_member",
            "can_delete_and_transfer": True,
            "current_organization_name": "UCD",
        }

        async with AsyncSessionLocal() as verify_db:
            assert await verify_db.get(Organization, old_org.id) is not None


@pytest.mark.asyncio
async def test_sole_member_delete_and_transfer_removes_old_org():
    email = f"ucd-delete-{uuid.uuid4().hex[:8]}@example.com"
    async with AsyncSessionLocal() as db_session:
        old_org, sole_user = await _create_org_with_owner(db_session, org_name="UCD", email=email)
        company = Company(
            organization_id=old_org.id,
            name="Senus",
            industry="Software",
            fiscal_year_end="06-30",
            currency="EUR",
        )
        db_session.add(company)
        await db_session.flush()
        document = Document(
            organization_id=old_org.id,
            company_id=company.id,
            uploaded_by_user_id=sole_user.id,
            filename="report.pdf",
            file_type="application/pdf",
            storage_path=f"/tmp/test-{uuid.uuid4().hex}.pdf",
            status=DocumentStatus.PENDING,
            source_type="manual_upload",
        )
        db_session.add(document)

        new_org, inviter = await _create_org_with_owner(
            db_session, org_name="Xiaomi", email=f"xiaomi-del-{uuid.uuid4().hex[:8]}@example.com"
        )
        invitation = await _create_transfer_invitation(
            db_session,
            target_org_id=new_org.id,
            email=sole_user.email,
            invited_by_user_id=inviter.id,
        )
        await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        wrong_name = await client.post(
            "/api/v1/auth/accept-invitation-with-deletion",
            json={
                "token": invitation.token,
                "password": "password123",
                "confirm_organization_name": "Wrong Name",
            },
        )
        assert wrong_name.status_code == 400

        success = await client.post(
            "/api/v1/auth/accept-invitation-with-deletion",
            json={
                "token": invitation.token,
                "password": "password123",
                "confirm_organization_name": "UCD",
            },
        )

    assert success.status_code == 201
    auth_body = success.json()
    assert auth_body["user"]["organization_name"] == "Xiaomi"
    assert auth_body["user"]["email"] == email

    async with AsyncSessionLocal() as verify_db:
        assert await verify_db.get(Organization, old_org.id) is None
        old_user = await UserRepository(verify_db).get_by_email(email)
        assert old_user is not None
        assert old_user.organization_id == new_org.id

        companies = await CompanyRepository(verify_db).list_for_org(organization_id=old_org.id)
        assert companies == []

        refreshed_invitation = await InvitationRepository(verify_db).get_by_token(invitation.token)
        assert refreshed_invitation is not None
        assert refreshed_invitation.status == InvitationStatus.ACCEPTED

        audit_result = await verify_db.execute(
            select(AuditLog).where(
                AuditLog.organization_id == new_org.id,
                AuditLog.action == "organization_deleted_via_transfer",
            )
        )
        audit_entries = list(audit_result.scalars().all())
        assert len(audit_entries) == 1
        assert audit_entries[0].extra_data["old_organization_name"] == "UCD"
        assert audit_entries[0].extra_data["old_organization_id"] == str(old_org.id)


@pytest.mark.asyncio
async def test_sole_owner_with_other_members_gets_transfer_ownership_error():
    async with AsyncSessionLocal() as db_session:
        old_org, owner = await _create_org_with_owner(
            db_session,
            org_name="UCD",
            email=f"owner-{uuid.uuid4().hex[:8]}@example.com",
        )
        await UserRepository(db_session).create(
            organization_id=old_org.id,
            email=f"member-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password=hash_password("password123"),
            full_name="Other Member",
            role=UserRole.VIEWER,
        )
        new_org, inviter = await _create_org_with_owner(
            db_session, org_name="Xiaomi", email=f"xiaomi-owner-{uuid.uuid4().hex[:8]}@example.com"
        )
        invitation = await _create_transfer_invitation(
            db_session,
            target_org_id=new_org.id,
            email=owner.email,
            invited_by_user_id=inviter.id,
        )
        await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/accept-invitation",
            json={"token": invitation.token, "password": "password123"},
        )

    assert response.status_code == 400
    assert "only owner" in response.json()["detail"].lower()

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        deletion_attempt = await client.post(
            "/api/v1/auth/accept-invitation-with-deletion",
            json={
                "token": invitation.token,
                "password": "password123",
                "confirm_organization_name": "UCD",
            },
        )

    assert deletion_attempt.status_code == 400
    assert "other members" in deletion_attempt.json()["detail"].lower()
