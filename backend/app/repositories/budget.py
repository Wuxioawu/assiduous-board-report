import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget import Budget


class BudgetRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_period(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID, period_end: date
    ) -> list[Budget]:
        result = await self.session.execute(
            select(Budget)
            .where(
                Budget.company_id == company_id,
                Budget.organization_id == organization_id,
                Budget.period_end == period_end,
            )
            .order_by(Budget.taxonomy_code)
        )
        return list(result.scalars().all())

    async def list_all(self, *, company_id: uuid.UUID, organization_id: uuid.UUID) -> list[Budget]:
        result = await self.session.execute(
            select(Budget)
            .where(
                Budget.company_id == company_id,
                Budget.organization_id == organization_id,
            )
            .order_by(Budget.period_end.desc(), Budget.taxonomy_code)
        )
        return list(result.scalars().all())

    async def get(
        self,
        *,
        company_id: uuid.UUID,
        organization_id: uuid.UUID,
        period_start: date,
        period_end: date,
        taxonomy_code: str,
    ) -> Budget | None:
        result = await self.session.execute(
            select(Budget).where(
                Budget.company_id == company_id,
                Budget.organization_id == organization_id,
                Budget.period_start == period_start,
                Budget.period_end == period_end,
                Budget.taxonomy_code == taxonomy_code,
            )
        )
        return result.scalar_one_or_none()

    async def upsert(
        self,
        *,
        organization_id: uuid.UUID,
        company_id: uuid.UUID,
        period_start: date,
        period_end: date,
        taxonomy_code: str,
        value: float,
        currency: str,
        created_by_user_id: uuid.UUID | None,
    ) -> Budget:
        existing = await self.get(
            company_id=company_id,
            organization_id=organization_id,
            period_start=period_start,
            period_end=period_end,
            taxonomy_code=taxonomy_code,
        )
        if existing is not None:
            existing.value = value
            existing.currency = currency
            existing.created_by_user_id = created_by_user_id
            await self.session.flush()
            return existing

        budget = Budget(
            organization_id=organization_id,
            company_id=company_id,
            period_start=period_start,
            period_end=period_end,
            taxonomy_code=taxonomy_code,
            value=value,
            currency=currency,
            created_by_user_id=created_by_user_id,
        )
        self.session.add(budget)
        await self.session.flush()
        return budget

    async def delete_for_period(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID, period_end: date
    ) -> int:
        entries = await self.list_for_period(
            company_id=company_id, organization_id=organization_id, period_end=period_end
        )
        for entry in entries:
            await self.session.delete(entry)
        await self.session.flush()
        return len(entries)
