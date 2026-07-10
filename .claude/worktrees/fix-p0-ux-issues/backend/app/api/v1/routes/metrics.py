import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, get_tenant_context
from app.db.session import get_db
from app.repositories.company import CompanyRepository
from app.repositories.metric import MetricRepository
from app.schemas.metric import MetricHistoryPoint, MetricHistoryResponse, MetricsResponse, MetricValue
from app.services.metrics.orchestrator import ensure_metrics_for_all_periods, get_or_compute_metrics
from app.services.metrics.registry import METRIC_REGISTRY, MetricCategory

router = APIRouter(tags=["metrics"])


@router.get("/companies/{company_id}/metrics", response_model=MetricsResponse)
async def get_metrics(
    company_id: uuid.UUID,
    period: date | None = Query(None, description="Reporting period_end; defaults to the latest available period"),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> MetricsResponse:
    company = await CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    metrics, target_period = await get_or_compute_metrics(
        db, organization_id=tenant.org_id, company_id=company_id, period_end=period
    )
    if target_period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No extracted financial data available for this company",
        )

    grouped: dict[str, list[MetricValue]] = {category.value: [] for category in MetricCategory}
    for m in metrics:
        definition = METRIC_REGISTRY.get(m.metric_key)
        category = definition.category.value if definition else MetricCategory.GROWTH.value
        grouped[category].append(
            MetricValue(key=m.metric_key, label=m.metric_label, value=float(m.value), unit=m.unit or "")
        )

    return MetricsResponse(
        company_id=company_id,
        period_start=metrics[0].period_start if metrics else None,
        period_end=target_period,
        growth=grouped[MetricCategory.GROWTH.value],
        profitability=grouped[MetricCategory.PROFITABILITY.value],
        cash=grouped[MetricCategory.CASH.value],
        solvency=grouped[MetricCategory.SOLVENCY.value],
        returns=grouped[MetricCategory.RETURNS.value],
    )


@router.get("/companies/{company_id}/metrics/history", response_model=MetricHistoryResponse)
async def get_metrics_history(
    company_id: uuid.UUID,
    keys: str = Query(..., description="Comma-separated metric keys, e.g. revenue,gross_margin,net_margin"),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> MetricHistoryResponse:
    company = await CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")

    metric_keys = [k.strip() for k in keys.split(",") if k.strip()]
    await ensure_metrics_for_all_periods(db, organization_id=tenant.org_id, company_id=company_id)

    metrics = await MetricRepository(db).list_history_for_keys(
        company_id=company_id, organization_id=tenant.org_id, metric_keys=metric_keys
    )
    series: dict[str, list[MetricHistoryPoint]] = {key: [] for key in metric_keys}
    for m in metrics:
        series[m.metric_key].append(
            MetricHistoryPoint(period_start=m.period_start, period_end=m.period_end, value=float(m.value))
        )

    return MetricHistoryResponse(company_id=company_id, series=series)
