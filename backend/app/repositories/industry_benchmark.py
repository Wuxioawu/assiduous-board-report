import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.industry_benchmark import IndustryBenchmark


class IndustryBenchmarkRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_industry(self, *, organization_id: uuid.UUID, industry: str) -> list[IndustryBenchmark]:
        # Ordered so that, when multiple period_labels exist for the same
        # metric_key, the most recently-curated one sorts first within its
        # group - callers picking "the" benchmark per metric (see
        # api/v1/routes/metrics.py) can just take the first match per key.
        result = await self.session.execute(
            select(IndustryBenchmark)
            .where(
                IndustryBenchmark.organization_id == organization_id,
                IndustryBenchmark.industry == industry,
            )
            .order_by(IndustryBenchmark.metric_key, IndustryBenchmark.created_at.desc())
        )
        return list(result.scalars().all())

    async def get(
        self, *, organization_id: uuid.UUID, industry: str, metric_key: str, period_label: str
    ) -> IndustryBenchmark | None:
        result = await self.session.execute(
            select(IndustryBenchmark).where(
                IndustryBenchmark.organization_id == organization_id,
                IndustryBenchmark.industry == industry,
                IndustryBenchmark.metric_key == metric_key,
                IndustryBenchmark.period_label == period_label,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id(
        self, benchmark_id: uuid.UUID, *, organization_id: uuid.UUID
    ) -> IndustryBenchmark | None:
        result = await self.session.execute(
            select(IndustryBenchmark).where(
                IndustryBenchmark.id == benchmark_id,
                IndustryBenchmark.organization_id == organization_id,
            )
        )
        return result.scalar_one_or_none()

    async def upsert(
        self,
        *,
        organization_id: uuid.UUID,
        industry: str,
        metric_key: str,
        period_label: str,
        benchmark_value: float,
        source: str,
        created_by_user_id: uuid.UUID | None,
    ) -> IndustryBenchmark:
        existing = await self.get(
            organization_id=organization_id, industry=industry, metric_key=metric_key, period_label=period_label
        )
        if existing is not None:
            existing.benchmark_value = benchmark_value
            existing.source = source
            existing.created_by_user_id = created_by_user_id
            await self.session.flush()
            return existing

        benchmark = IndustryBenchmark(
            organization_id=organization_id,
            industry=industry,
            metric_key=metric_key,
            period_label=period_label,
            benchmark_value=benchmark_value,
            source=source,
            created_by_user_id=created_by_user_id,
        )
        self.session.add(benchmark)
        await self.session.flush()
        return benchmark

    async def delete(self, benchmark: IndustryBenchmark) -> None:
        await self.session.delete(benchmark)
        await self.session.flush()
