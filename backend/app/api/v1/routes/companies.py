import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import TenantContext, create_audit_log, get_or_404, get_tenant_context, require_role
from app.db.session import get_db
from app.models.enums import PeriodType, UserRole
from app.repositories.company import CompanyRepository
from app.repositories.document import DocumentRepository
from app.repositories.financial_statement import FinancialStatementRepository
from app.schemas.accuracy_report import AccuracyReportRead, AccuracyReportRequest
from app.schemas.company import (
    CompanyCreate,
    CompanyFetchResult,
    CompanyLogoResponse,
    CompanyPeriod,
    CompanyRead,
    CompanyUpdate,
)
from app.services.accuracy_report import (
    ExtractionNotCompleteError,
    MalformedGroundTruthFixtureError,
    build_accuracy_report,
)
from app.services.avatar import ALLOWED_AVATAR_CONTENT_TYPES, process_avatar_image
from app.services.extraction.auto_fetch import run_fetch_check
from app.services.extraction.pipeline import run_extraction
from app.services.metrics.fiscal_periods import classify_period_type, fiscal_quarter_of, fiscal_year_of
from app.services.storage import StorageService, get_storage_service, is_remote_storage_path

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[CompanyRead])
async def list_companies(
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[CompanyRead]:
    companies = await CompanyRepository(db).list_for_org(organization_id=tenant.org_id)
    return [CompanyRead.model_validate(c) for c in companies]


@router.post("", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> CompanyRead:
    company = await CompanyRepository(db).create(
        organization_id=tenant.org_id,
        name=payload.name,
        industry=payload.industry,
        fiscal_year_end=payload.fiscal_year_end,
        currency=payload.currency,
        reporting_frequency=payload.reporting_frequency,
        fiscal_year_start_month=payload.fiscal_year_start_month,
        description=payload.description,
        founded_date=payload.founded_date,
        website_url=payload.website_url,
        headquarters_location=payload.headquarters_location,
        employee_count_range=payload.employee_count_range,
    )
    await db.commit()
    return CompanyRead.model_validate(company)


@router.get("/{company_id}", response_model=CompanyRead)
async def get_company(
    company_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> CompanyRead:
    company = await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )
    return CompanyRead.model_validate(company)


@router.patch("/{company_id}", response_model=CompanyRead)
async def update_company(
    company_id: uuid.UUID,
    payload: CompanyUpdate,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> CompanyRead:
    company_repo = CompanyRepository(db)
    company = await get_or_404(
        lambda: company_repo.get_by_id(company_id, organization_id=tenant.org_id), detail="Company not found"
    )

    updates = payload.model_dump(exclude_unset=True)
    if updates:
        await company_repo.update(company, updates=updates)
        # JSON-mode dump for the audit log specifically: extra_data is a JSONB
        # column, and native Python types among the updated fields (e.g.
        # founded_date is a date object) aren't JSON-serializable as-is, while
        # `updates` above must stay in native Python form for the actual
        # SQLAlchemy column assignment.
        audit_extra_data = payload.model_dump(exclude_unset=True, mode="json")
        await create_audit_log(
            db,
            tenant,
            action="company_updated",
            resource_type="company",
            resource_id=company_id,
            extra_data=audit_extra_data,
        )
        await db.commit()
        await db.refresh(company)
    return CompanyRead.model_validate(company)


@router.post("/{company_id}/logo", response_model=CompanyLogoResponse)
async def upload_company_logo(
    company_id: uuid.UUID,
    file: UploadFile,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> CompanyLogoResponse:
    company_repo = CompanyRepository(db)
    company = await get_or_404(
        lambda: company_repo.get_by_id(company_id, organization_id=tenant.org_id), detail="Company not found"
    )

    if file.content_type not in ALLOWED_AVATAR_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPG, PNG, or WEBP images are supported"
        )

    settings = get_settings()
    raw = await file.read()
    if len(raw) > settings.avatar_max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image exceeds the {settings.avatar_max_size_bytes // (1024 * 1024)}MB size limit",
        )

    try:
        processed = process_avatar_image(raw, dimension=settings.avatar_dimension_px)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # Remove the previous file (if any) so re-uploads don't accumulate orphaned files.
    if company.logo_storage_path:
        await storage.delete(company.logo_storage_path)

    storage_path = await storage.save_logo_bytes(company_id=company.id, filename="logo.jpg", content=processed)
    # Version segment makes the URL genuinely change on every upload, not just the
    # underlying file - see the avatar_url fix in upload_avatar for why a stable
    # URL here would leave browsers showing a stale cached logo after a re-upload.
    logo_version = Path(storage_path).stem
    logo_url = f"/api/v1/companies/{company.id}/logo/{logo_version}"
    await company_repo.update(company, updates={"logo_url": logo_url, "logo_storage_path": storage_path})
    await create_audit_log(
        db,
        tenant,
        action="company_logo_updated",
        resource_type="company",
        resource_id=company_id,
    )
    await db.commit()
    return CompanyLogoResponse(logo_url=logo_url)


@router.delete("/{company_id}/logo", response_model=CompanyLogoResponse)
async def delete_company_logo(
    company_id: uuid.UUID,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> CompanyLogoResponse:
    company_repo = CompanyRepository(db)
    company = await get_or_404(
        lambda: company_repo.get_by_id(company_id, organization_id=tenant.org_id), detail="Company not found"
    )

    if company.logo_storage_path:
        await storage.delete(company.logo_storage_path)
    await company_repo.update(company, updates={"logo_url": None, "logo_storage_path": None})
    await create_audit_log(
        db,
        tenant,
        action="company_logo_removed",
        resource_type="company",
        resource_id=company_id,
    )
    await db.commit()
    return CompanyLogoResponse(logo_url=None)


async def _serve_company_logo(
    company_id: uuid.UUID, db: AsyncSession, *, cacheable: bool
) -> FileResponse | RedirectResponse:
    # Deliberately unauthenticated, same tradeoff as the user avatar serve route
    # (see routes/users.py): an <img src> can't attach an Authorization header, and
    # company_id is already an unguessable UUID.
    company = await CompanyRepository(db).get_by_id_unscoped(company_id)
    if company is None or not company.logo_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No logo set for this company")

    headers = (
        {"Cache-Control": "public, max-age=31536000, immutable"}
        if cacheable
        else {"Cache-Control": "no-store"}
    )

    # STORAGE_PROVIDER=supabase stores a public URL as logo_storage_path, not a
    # local path - see the matching comment in routes/users.py's _serve_avatar.
    if is_remote_storage_path(company.logo_storage_path):
        return RedirectResponse(company.logo_storage_path, headers=headers)

    if not Path(company.logo_storage_path).is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No logo set for this company")
    return FileResponse(company.logo_storage_path, media_type="image/jpeg", headers=headers)


@router.get("/{company_id}/logo", response_model=None)
async def get_company_logo(company_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> FileResponse | RedirectResponse:
    return await _serve_company_logo(company_id, db, cacheable=False)


@router.get("/{company_id}/logo/{version}", response_model=None)
async def get_company_logo_versioned(
    company_id: uuid.UUID, version: str, db: AsyncSession = Depends(get_db)
) -> FileResponse | RedirectResponse:
    # `version` isn't looked up - it only exists to make the URL unique per upload
    # so browsers always refetch a changed logo (see upload_company_logo).
    return await _serve_company_logo(company_id, db, cacheable=True)


@router.post("/{company_id}/fetch-now", response_model=CompanyFetchResult)
async def fetch_company_now(
    company_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN, UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> CompanyFetchResult:
    company = await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )
    if not company.investor_relations_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This company has no investor-relations URL configured",
        )

    def schedule_extraction(
        document_id: uuid.UUID, organization_id: uuid.UUID, comp_id: uuid.UUID
    ) -> None:
        background_tasks.add_task(
            run_extraction,
            document_id=document_id,
            organization_id=organization_id,
            company_id=comp_id,
        )

    outcome = await run_fetch_check(
        db,
        organization_id=tenant.org_id,
        company=company,
        storage=storage,
        schedule_extraction=schedule_extraction,
    )

    await create_audit_log(
        db,
        tenant,
        action="company_fetch_triggered",
        resource_type="company",
        resource_id=company_id,
        extra_data={"found_new": len(outcome.documents), "message": outcome.message, "error": outcome.error},
    )
    await db.commit()

    return CompanyFetchResult(
        found_new=len(outcome.documents),
        message=outcome.message,
        last_fetch_checked_at=company.last_fetch_checked_at,
        auto_fetch_enabled=company.auto_fetch_enabled,
    )


@router.post("/{company_id}/accuracy-report", response_model=AccuracyReportRead)
async def create_accuracy_report(
    company_id: uuid.UUID,
    payload: AccuracyReportRequest,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> AccuracyReportRead:
    """Admin-only: scores one document's current extraction output against its
    ground-truth fixture (if any) and its accounting-identity check results
    (always) - see services/accuracy_report.py. Read-only over the document's
    data (doesn't re-run extraction or validation); the re-extract endpoint
    (routes/documents.py) triggers this automatically once a fresh extraction
    completes, this endpoint is for re-scoring the same extracted data on
    demand without a new extraction run."""
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    async def _get_document_for_company():
        doc = await DocumentRepository(db).get_by_id(payload.document_id, organization_id=tenant.org_id)
        return doc if doc is not None and doc.company_id == company_id else None

    document = await get_or_404(_get_document_for_company, detail="Document not found")

    try:
        report = await build_accuracy_report(
            db, organization_id=tenant.org_id, company_id=company_id, document=document
        )
    except ExtractionNotCompleteError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except MalformedGroundTruthFixtureError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    await create_audit_log(
        db,
        tenant,
        action="accuracy_report_generated",
        resource_type="document",
        resource_id=document.id,
        extra_data={
            "fields_compared": report.scorecard["fields_compared"],
            "exact_matches": report.scorecard["exact_matches"],
            "identity_checks_passed": report.scorecard["identity_checks_passed"],
            "identity_checks_total": report.scorecard["identity_checks_total"],
        },
    )
    await db.commit()
    return AccuracyReportRead.model_validate(report)


@router.get("/{company_id}/periods", response_model=list[CompanyPeriod])
async def list_company_periods(
    company_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[CompanyPeriod]:
    company = await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    periods = await FinancialStatementRepository(db).list_periods(
        company_id=company_id, organization_id=tenant.org_id
    )
    result = []
    for start, end in periods:
        # Same derivation the /metrics/history endpoint uses (see routes/metrics.py) -
        # period_type is fully determined by the period's own dates, so every period
        # in the app is classified identically regardless of which endpoint serves it.
        period_type = classify_period_type(start, end)
        fiscal_year = fiscal_year_of(start, fiscal_year_start_month=company.fiscal_year_start_month)
        fiscal_quarter = (
            fiscal_quarter_of(start, fiscal_year_start_month=company.fiscal_year_start_month)
            if period_type == PeriodType.Q
            else None
        )
        result.append(
            CompanyPeriod(
                period_start=start,
                period_end=end,
                period_type=period_type,
                fiscal_year=fiscal_year,
                fiscal_quarter=fiscal_quarter,
            )
        )
    return result


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: uuid.UUID,
    tenant: TenantContext = Depends(require_role(UserRole.OWNER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> None:
    company_repo = CompanyRepository(db)
    company = await get_or_404(
        lambda: company_repo.get_by_id(company_id, organization_id=tenant.org_id), detail="Company not found"
    )

    company_name = company.name
    documents = await DocumentRepository(db).list_for_company(
        company_id=company_id, organization_id=tenant.org_id
    )
    for document in documents:
        await storage.delete(document.storage_path)
    if company.logo_storage_path:
        await storage.delete(company.logo_storage_path)

    # Document, FinancialStatement, Metric, and Insight rows cascade-delete at the DB
    # level (see CompanyRepository.delete).
    await company_repo.delete(company)
    await create_audit_log(
        db,
        tenant,
        action="company_deleted",
        resource_type="company",
        resource_id=company_id,
        extra_data={"company_name": company_name},
    )
    await db.commit()
