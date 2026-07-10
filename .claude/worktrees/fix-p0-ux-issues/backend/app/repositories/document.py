import uuid

from sqlalchemy import select
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
        uploaded_by_user_id: uuid.UUID,
        filename: str,
        file_type: str,
        storage_path: str,
    ) -> Document:
        document = Document(
            organization_id=organization_id,
            company_id=company_id,
            uploaded_by_user_id=uploaded_by_user_id,
            filename=filename,
            file_type=file_type,
            storage_path=storage_path,
            status=DocumentStatus.PENDING,
        )
        self.session.add(document)
        await self.session.flush()
        return document

    async def get_by_id(
        self, document_id: uuid.UUID, *, organization_id: uuid.UUID
    ) -> Document | None:
        result = await self.session.execute(
            select(Document).where(
                Document.id == document_id, Document.organization_id == organization_id
            )
        )
        return result.scalar_one_or_none()

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
