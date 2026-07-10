import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization


class OrganizationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, *, name: str, slug: str) -> Organization:
        organization = Organization(name=name, slug=slug)
        self.session.add(organization)
        await self.session.flush()
        return organization

    async def get_by_id(self, organization_id: uuid.UUID) -> Organization | None:
        return await self.session.get(Organization, organization_id)

    async def slug_exists(self, slug: str) -> bool:
        result = await self.session.execute(select(Organization.id).where(Organization.slug == slug))
        return result.scalar_one_or_none() is not None
