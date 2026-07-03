import uuid
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.insight import Insight


class InsightRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_for_period_audience(
        self,
        *,
        company_id: uuid.UUID,
        organization_id: uuid.UUID,
        period_end: date,
        audience: str,
    ) -> Insight | None:
        result = await self.session.execute(
            select(Insight).where(
                Insight.company_id == company_id,
                Insight.organization_id == organization_id,
                Insight.period_end == period_end,
                Insight.audience == audience,
            )
        )
        return result.scalar_one_or_none()

    async def delete_for_period_audience(
        self,
        *,
        company_id: uuid.UUID,
        organization_id: uuid.UUID,
        period_end: date,
        audience: str | None = None,
    ) -> None:
        conditions = [
            Insight.company_id == company_id,
            Insight.organization_id == organization_id,
            Insight.period_end == period_end,
        ]
        if audience is not None:
            conditions.append(Insight.audience == audience)
        await self.session.execute(delete(Insight).where(*conditions))

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        company_id: uuid.UUID,
        audience: str,
        period_start: date,
        period_end: date,
        insight_type: str,
        title: str,
        body: str,
        severity,
        source_metric_ids: list | None,
    ) -> Insight:
        insight = Insight(
            organization_id=organization_id,
            company_id=company_id,
            audience=audience,
            period_start=period_start,
            period_end=period_end,
            insight_type=insight_type,
            title=title,
            body=body,
            severity=severity,
            source_metric_ids=source_metric_ids,
        )
        self.session.add(insight)
        await self.session.flush()
        return insight
