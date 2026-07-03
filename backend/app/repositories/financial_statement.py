import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_statement import FinancialStatement


class FinancialStatementRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_company(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID
    ) -> list[FinancialStatement]:
        result = await self.session.execute(
            select(FinancialStatement)
            .where(
                FinancialStatement.company_id == company_id,
                FinancialStatement.organization_id == organization_id,
            )
            .order_by(FinancialStatement.period_end.desc(), FinancialStatement.taxonomy_code)
        )
        return list(result.scalars().all())

    async def get_latest_period_end(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID
    ) -> date | None:
        result = await self.session.execute(
            select(func.max(FinancialStatement.period_end)).where(
                FinancialStatement.company_id == company_id,
                FinancialStatement.organization_id == organization_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_period_ends(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID
    ) -> list[date]:
        result = await self.session.execute(
            select(FinancialStatement.period_end)
            .where(
                FinancialStatement.company_id == company_id,
                FinancialStatement.organization_id == organization_id,
            )
            .distinct()
            .order_by(FinancialStatement.period_end)
        )
        return list(result.scalars().all())

    async def get_by_id(
        self, statement_id: uuid.UUID, *, organization_id: uuid.UUID
    ) -> FinancialStatement | None:
        result = await self.session.execute(
            select(FinancialStatement).where(
                FinancialStatement.id == statement_id,
                FinancialStatement.organization_id == organization_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        company_id: uuid.UUID,
        document_id: uuid.UUID | None,
        taxonomy_code: str,
        value: float,
        currency: str,
        period_start: date,
        period_end: date,
        confidence_score: float | None,
        source_excerpt: str | None,
        source_page: int | None,
        extracted_by: str = "ai",
    ) -> FinancialStatement:
        statement = FinancialStatement(
            organization_id=organization_id,
            company_id=company_id,
            document_id=document_id,
            taxonomy_code=taxonomy_code,
            value=value,
            currency=currency,
            period_start=period_start,
            period_end=period_end,
            confidence_score=confidence_score,
            source_excerpt=source_excerpt,
            source_page=source_page,
            extracted_by=extracted_by,
        )
        self.session.add(statement)
        await self.session.flush()
        return statement
