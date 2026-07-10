import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


class AuditLogRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_resource(
        self,
        *,
        organization_id: uuid.UUID,
        resource_type: str,
        resource_id: uuid.UUID,
    ) -> list[AuditLog]:
        result = await self.session.execute(
            select(AuditLog)
            .where(
                AuditLog.organization_id == organization_id,
                AuditLog.resource_type == resource_type,
                AuditLog.resource_id == resource_id,
            )
            .order_by(AuditLog.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        user_id: uuid.UUID | None,
        action: str,
        resource_type: str | None = None,
        resource_id: uuid.UUID | None = None,
        extra_data: dict | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            organization_id=organization_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            extra_data=extra_data,
        )
        self.session.add(entry)
        await self.session.flush()
        return entry
