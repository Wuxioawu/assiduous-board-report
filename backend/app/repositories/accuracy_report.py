import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accuracy_report import AccuracyReport


class AccuracyReportRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_latest_for_document(
        self, *, document_id: uuid.UUID, organization_id: uuid.UUID
    ) -> AccuracyReport | None:
        result = await self.session.execute(
            select(AccuracyReport)
            .where(
                AccuracyReport.document_id == document_id,
                AccuracyReport.organization_id == organization_id,
            )
            .order_by(AccuracyReport.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
