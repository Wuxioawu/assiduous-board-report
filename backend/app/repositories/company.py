import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company


class CompanyRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_org(self, *, organization_id: uuid.UUID) -> list[Company]:
        result = await self.session.execute(
            select(Company).where(Company.organization_id == organization_id).order_by(Company.name)
        )
        return list(result.scalars().all())

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        industry: str | None,
        fiscal_year_end: str | None,
        currency: str,
    ) -> Company:
        company = Company(
            organization_id=organization_id,
            name=name,
            industry=industry,
            fiscal_year_end=fiscal_year_end,
            currency=currency,
        )
        self.session.add(company)
        await self.session.flush()
        return company
