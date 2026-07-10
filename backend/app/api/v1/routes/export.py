import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, create_audit_log, get_or_404, get_tenant_context
from app.db.session import get_db
from app.repositories.company import CompanyRepository
from app.schemas.export import ExportRequest
from app.services.export.pdf import build_report_filename, render_report_pdf

router = APIRouter(tags=["export"])


def _content_disposition(filename: str) -> str:
    ascii_fallback = filename.encode("ascii", "ignore").decode("ascii").strip() or "report.pdf"
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename)}"


@router.post("/companies/{company_id}/export/pdf")
async def export_report_pdf(
    company_id: uuid.UUID,
    payload: ExportRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> Response:
    company = await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    pdf_bytes, period_start, target_period = await render_report_pdf(
        db,
        organization_id=tenant.org_id,
        company=company,
        sections=payload.sections,
        period_end=payload.period,
    )
    if target_period is None or pdf_bytes is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No extracted financial data available for this company",
        )

    await create_audit_log(
        db,
        tenant,
        action="report_exported",
        resource_type="company",
        resource_id=company_id,
        extra_data={
            "sections": [s.value for s in payload.sections],
            "period_end": target_period.isoformat(),
        },
    )
    await db.commit()

    filename = build_report_filename(company.name, period_start, target_period)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(filename)},
    )
