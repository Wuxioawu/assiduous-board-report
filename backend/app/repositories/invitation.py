import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import InvitationStatus, InvitationType, UserRole
from app.models.invitation import Invitation


class InvitationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        email: str,
        role: UserRole,
        invited_by_user_id: uuid.UUID,
        token: str,
        expires_at: datetime,
        invitation_type: InvitationType = InvitationType.NEW_USER,
    ) -> Invitation:
        invitation = Invitation(
            organization_id=organization_id,
            email=email,
            role=role,
            invited_by_user_id=invited_by_user_id,
            token=token,
            status=InvitationStatus.PENDING,
            expires_at=expires_at,
            invitation_type=invitation_type,
        )
        self.session.add(invitation)
        await self.session.flush()
        return invitation

    async def get_by_token(self, token: str) -> Invitation | None:
        # Pre-authentication lookup: tenant is not yet known.
        result = await self.session.execute(select(Invitation).where(Invitation.token == token))
        return result.scalar_one_or_none()

    async def get_by_id(self, invitation_id: uuid.UUID, *, organization_id: uuid.UUID) -> Invitation | None:
        result = await self.session.execute(
            select(Invitation).where(
                Invitation.id == invitation_id, Invitation.organization_id == organization_id
            )
        )
        return result.scalar_one_or_none()

    async def list_pending_for_org(self, *, organization_id: uuid.UUID) -> list[Invitation]:
        result = await self.session.execute(
            select(Invitation)
            .where(
                Invitation.organization_id == organization_id,
                Invitation.status == InvitationStatus.PENDING,
            )
            .order_by(Invitation.created_at.desc())
        )
        invitations = list(result.scalars().all())

        # Lazily flip any invitation that has passed its expiry into EXPIRED so
        # it drops out of the "pending" list on this and future reads, rather
        # than running a background sweep job for a field nobody else reads.
        now = datetime.now(UTC)
        still_pending = []
        for invitation in invitations:
            if invitation.expires_at < now:
                invitation.status = InvitationStatus.EXPIRED
            else:
                still_pending.append(invitation)
        if len(still_pending) != len(invitations):
            await self.session.flush()
        return still_pending

    async def mark_accepted(self, invitation: Invitation) -> None:
        invitation.status = InvitationStatus.ACCEPTED
        await self.session.flush()

    async def mark_expired(self, invitation: Invitation) -> None:
        invitation.status = InvitationStatus.EXPIRED
        await self.session.flush()

    async def delete(self, invitation: Invitation) -> None:
        await self.session.delete(invitation)
        await self.session.flush()
