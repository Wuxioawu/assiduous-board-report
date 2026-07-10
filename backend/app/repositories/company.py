import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.enums import ReportingFrequency


class CompanyRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_org(self, *, organization_id: uuid.UUID) -> list[Company]:
        result = await self.session.execute(
            select(Company).where(Company.organization_id == organization_id).order_by(Company.name)
        )
        return list(result.scalars().all())

    async def get_by_id(self, company_id: uuid.UUID, *, organization_id: uuid.UUID) -> Company | None:
        result = await self.session.execute(
            select(Company).where(Company.id == company_id, Company.organization_id == organization_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_unscoped(self, company_id: uuid.UUID) -> Company | None:
        # Used only by the public, unauthenticated logo-serving route - an <img src>
        # can't attach an Authorization header, so tenant scoping isn't available
        # there. Mirrors UserRepository.get_by_id_unscoped for the same reason.
        return await self.session.get(Company, company_id)

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        name: str,
        industry: str | None,
        fiscal_year_end: str | None,
        currency: str,
        reporting_frequency: ReportingFrequency | None = None,
        fiscal_year_start_month: int = 1,
        description: str | None = None,
        founded_date: date | None = None,
        website_url: str | None = None,
        headquarters_location: str | None = None,
        employee_count_range: str | None = None,
    ) -> Company:
        company = Company(
            organization_id=organization_id,
            name=name,
            industry=industry,
            fiscal_year_end=fiscal_year_end,
            currency=currency,
            reporting_frequency=reporting_frequency,
            fiscal_year_start_month=fiscal_year_start_month,
            description=description,
            founded_date=founded_date,
            website_url=website_url,
            headquarters_location=headquarters_location,
            employee_count_range=employee_count_range,
        )
        self.session.add(company)
        await self.session.flush()
        return company

    async def update(self, company: Company, *, updates: dict) -> None:
        for field, value in updates.items():
            setattr(company, field, value)
        await self.session.flush()

    async def update_currency(self, company: Company, *, currency: str) -> None:
        # Company.currency is set once at company creation (defaulting to USD)
        # and is otherwise never touched; extraction is the only place that
        # observes the currency actually used in a company's filings, so it
        # must sync this field back or /metrics and /companies/{id} keep
        # reporting the stale creation-time currency while the extracted
        # FinancialStatement rows (and the data table reading them) show the
        # real one. See the ReportView currency-regression investigation.
        if company.currency != currency:
            company.currency = currency
            await self.session.flush()

    async def list_auto_fetch_enabled(self) -> list[Company]:
        """Companies across all orgs with auto-fetch on, for the periodic
        scheduler (see services/extraction/auto_fetch.py) which runs
        system-wide rather than within a single tenant's request."""
        result = await self.session.execute(
            select(Company).where(Company.auto_fetch_enabled.is_(True))
        )
        return list(result.scalars().all())

    async def update_fetch_status(self, company: Company, *, checked_at: datetime, result: str) -> None:
        company.last_fetch_checked_at = checked_at
        company.last_fetch_result = result
        await self.session.flush()

    async def delete(self, company: Company) -> None:
        # Document, FinancialStatement, Metric, and Insight rows for this company are
        # removed by the DB-level ON DELETE CASCADE FK constraints (see the initial
        # schema migration) - no need to delete them here.
        await self.session.delete(company)
        await self.session.flush()
