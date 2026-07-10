import uuid
from datetime import date

from sqlalchemy import delete, func, select
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

    async def list_periods(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID
    ) -> list[tuple[date, date]]:
        result = await self.session.execute(
            select(FinancialStatement.period_start, FinancialStatement.period_end)
            .where(
                FinancialStatement.company_id == company_id,
                FinancialStatement.organization_id == organization_id,
            )
            .distinct()
            .order_by(FinancialStatement.period_end.desc())
        )
        return [(row.period_start, row.period_end) for row in result.all()]

    async def list_for_document(
        self, *, document_id: uuid.UUID, organization_id: uuid.UUID
    ) -> list[FinancialStatement]:
        result = await self.session.execute(
            select(FinancialStatement).where(
                FinancialStatement.document_id == document_id,
                FinancialStatement.organization_id == organization_id,
            )
        )
        return list(result.scalars().all())

    async def delete_for_document(
        self, *, document_id: uuid.UUID, organization_id: uuid.UUID
    ) -> None:
        await self.session.execute(
            delete(FinancialStatement).where(
                FinancialStatement.document_id == document_id,
                FinancialStatement.organization_id == organization_id,
            )
        )

    async def get_by_taxonomy_and_period(
        self,
        *,
        company_id: uuid.UUID,
        organization_id: uuid.UUID,
        taxonomy_code: str,
        period_start: date,
        period_end: date,
    ) -> FinancialStatement | None:
        result = await self.session.execute(
            select(FinancialStatement).where(
                FinancialStatement.company_id == company_id,
                FinancialStatement.organization_id == organization_id,
                FinancialStatement.taxonomy_code == taxonomy_code,
                FinancialStatement.period_start == period_start,
                FinancialStatement.period_end == period_end,
            )
        )
        return result.scalar_one_or_none()

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

    async def create_many(self, statements: list[FinancialStatement]) -> list[FinancialStatement]:
        """Persists every extracted line item in a single flush instead of one
        round trip per row - a single document's extraction can produce
        dozens of line items, and FinancialStatement.id is a Python-side
        uuid4 default (see UUIDPKMixin), so there's no server-generated value
        that needs an individual flush to observe."""
        self.session.add_all(statements)
        await self.session.flush()
        return statements
