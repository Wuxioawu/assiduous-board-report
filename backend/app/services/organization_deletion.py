import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.company import CompanyRepository
from app.repositories.document import DocumentRepository
from app.services.storage import StorageService


async def purge_organization_company_data(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    storage: StorageService,
) -> None:
    """Remove all companies for an organization and their stored document files.

    Mirrors the company-deletion route: delete storage files first, then rely on
    DB-level ON DELETE CASCADE for Document, FinancialStatement, Metric, Insight,
    Budget, and Comment rows tied to each company."""
    company_repo = CompanyRepository(db)
    doc_repo = DocumentRepository(db)
    companies = await company_repo.list_for_org(organization_id=organization_id)
    for company in companies:
        documents = await doc_repo.list_for_company(
            company_id=company.id, organization_id=organization_id
        )
        for document in documents:
            await storage.delete(document.storage_path)
        await company_repo.delete(company)
