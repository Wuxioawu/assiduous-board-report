import uuid
from datetime import date

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.metric import Metric


class MetricRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_period(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID, period_end: date
    ) -> list[Metric]:
        result = await self.session.execute(
            select(Metric)
            .where(
                Metric.company_id == company_id,
                Metric.organization_id == organization_id,
                Metric.period_end == period_end,
            )
            .order_by(Metric.metric_key)
        )
        return list(result.scalars().all())

    async def list_history_for_keys(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID, metric_keys: list[str]
    ) -> list[Metric]:
        result = await self.session.execute(
            select(Metric)
            .where(
                Metric.company_id == company_id,
                Metric.organization_id == organization_id,
                Metric.metric_key.in_(metric_keys),
            )
            .order_by(Metric.period_end)
        )
        return list(result.scalars().all())

    async def delete_for_period(
        self,
        *,
        company_id: uuid.UUID,
        organization_id: uuid.UUID,
        period_start: date,
        period_end: date,
    ) -> None:
        await self.session.execute(
            delete(Metric).where(
                Metric.company_id == company_id,
                Metric.organization_id == organization_id,
                Metric.period_start == period_start,
                Metric.period_end == period_end,
            )
        )

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        company_id: uuid.UUID,
        financial_statement_id: uuid.UUID | None,
        metric_key: str,
        metric_label: str,
        value: float,
        unit: str | None,
        period_start: date,
        period_end: date,
    ) -> Metric:
        metric = Metric(
            organization_id=organization_id,
            company_id=company_id,
            financial_statement_id=financial_statement_id,
            metric_key=metric_key,
            metric_label=metric_label,
            value=value,
            unit=unit,
            period_start=period_start,
            period_end=period_end,
        )
        self.session.add(metric)
        await self.session.flush()
        return metric
