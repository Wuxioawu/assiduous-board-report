import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.enums import DocumentStatus


class DocumentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_company(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID
    ) -> list[Document]:
        result = await self.session.execute(
            select(Document)
            .where(Document.company_id == company_id, Document.organization_id == organization_id)
            .order_by(Document.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        company_id: uuid.UUID,
        uploaded_by_user_id: uuid.UUID | None,
        filename: str,
        file_type: str,
        storage_path: str,
        source_type: str = "manual_upload",
        source_url: str | None = None,
        external_source_id: str | None = None,
    ) -> Document:
        document = Document(
            organization_id=organization_id,
            company_id=company_id,
            uploaded_by_user_id=uploaded_by_user_id,
            filename=filename,
            file_type=file_type,
            storage_path=storage_path,
            status=DocumentStatus.PENDING,
            source_type=source_type,
            source_url=source_url,
            external_source_id=external_source_id,
        )
        self.session.add(document)
        await self.session.flush()
        return document

    async def list_external_source_ids_for_company(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID
    ) -> set[str]:
        """External-source result IDs already ingested for this company, used
        by auto-fetch to skip results it has already downloaded on a previous
        check - dedup by the source site's own ID rather than filename, since
        filenames can repeat (version-like text) for what is really the same
        result."""
        result = await self.session.execute(
            select(Document.external_source_id).where(
                Document.company_id == company_id,
                Document.organization_id == organization_id,
                Document.external_source_id.is_not(None),
            )
        )
        return {row[0] for row in result.all()}

    async def list_filenames_for_company(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID
    ) -> set[str]:
        """Filenames already ingested for this company (any source). A cheap
        pre-click dedup check for auto-fetch: a card whose title exactly
        matches an already-ingested filename is skipped before spending a
        click + page load on it at all, rather than only being caught by the
        authoritative external_source_id check after navigating in."""
        result = await self.session.execute(
            select(Document.filename).where(
                Document.company_id == company_id,
                Document.organization_id == organization_id,
            )
        )
        return {row[0] for row in result.all()}

    async def count_auto_fetched_since(self, *, organization_id: uuid.UUID, since: datetime) -> int:
        """Count of auto-fetched documents (each one triggers exactly one LLM
        extraction call) for an organization since a given time - the basis
        for auto-fetch's per-organization daily extraction cap (see
        services/extraction/auto_fetch.py). Deliberately organization-wide,
        not per-company: the cap is meant to bound total cost exposure across
        every company that org has auto-fetch enabled for."""
        result = await self.session.execute(
            select(func.count())
            .select_from(Document)
            .where(
                Document.organization_id == organization_id,
                Document.source_type == "auto_fetched",
                Document.created_at >= since,
            )
        )
        return result.scalar_one()

    async def get_by_id(
        self, document_id: uuid.UUID, *, organization_id: uuid.UUID
    ) -> Document | None:
        result = await self.session.execute(
            select(Document).where(
                Document.id == document_id, Document.organization_id == organization_id
            )
        )
        return result.scalar_one_or_none()

    async def delete(self, document: Document) -> None:
        await self.session.delete(document)
        await self.session.flush()

    async def update_status(
        self,
        document_id: uuid.UUID,
        *,
        organization_id: uuid.UUID,
        status: DocumentStatus,
        error_message: str | None = None,
    ) -> Document | None:
        document = await self.get_by_id(document_id, organization_id=organization_id)
        if document is None:
            return None
        document.status = status
        document.error_message = error_message
        await self.session.flush()
        return document
