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
        value: float | None,
        unit: str | None,
        period_start: date,
        period_end: date,
        reason: str | None = None,
        missing_taxonomy_codes: list[str] | None = None,
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
            reason=reason,
            missing_taxonomy_codes=missing_taxonomy_codes,
        )
        self.session.add(metric)
        await self.session.flush()
        return metric

    async def create_many(self, metrics: list[Metric]) -> list[Metric]:
        """Persists every metric in a single flush instead of one round trip
        per row - compute_and_store_metrics builds one Metric per registry
        entry (~20 rows) on every extraction/recompute, and Metric.id is a
        Python-side uuid4 default (see UUIDPKMixin), so there's no
        server-generated value that needs an individual flush to observe."""
        self.session.add_all(metrics)
        await self.session.flush()
        return metrics
