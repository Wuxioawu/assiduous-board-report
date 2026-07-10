import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, get_or_404, get_tenant_context
from app.db.session import get_db
from app.models.budget import Budget
from app.models.industry_benchmark import IndustryBenchmark
from app.repositories.budget import BudgetRepository
from app.repositories.company import CompanyRepository
from app.repositories.industry_benchmark import IndustryBenchmarkRepository
from app.repositories.metric import MetricRepository
from app.schemas.metric import MetricHistoryPoint, MetricHistoryResponse, MetricsResponse, MetricValue
from app.services.metrics.orchestrator import ensure_metrics_for_all_periods, get_or_compute_metrics
from app.services.metrics.registry import METRIC_REGISTRY, MetricCategory, MetricDefinition

router = APIRouter(tags=["metrics"])


def _build_metric_value(
    m,
    definition: MetricDefinition | None,
    budgets_by_taxonomy: dict[str, Budget],
    benchmarks_by_metric_key: dict[str, IndustryBenchmark],
) -> MetricValue:
    value = float(m.value) if m.value is not None else None
    base = MetricValue(
        key=m.metric_key,
        label=m.metric_label,
        value=value,
        reason=m.reason,
        missing_taxonomy_codes=m.missing_taxonomy_codes,
        unit=m.unit or "",
    )
    if value is None:
        # Nothing to compare a missing value against - budget/benchmark
        # variance is meaningless without an actual computed value.
        return base

    updates: dict = {}

    if definition is not None and definition.budget_taxonomy_code is not None:
        budget = budgets_by_taxonomy.get(definition.budget_taxonomy_code)
        if budget is not None:
            budget_value = float(budget.value)
            variance = value - budget_value
            updates["budget_value"] = budget_value
            updates["variance"] = variance
            updates["variance_pct"] = (variance / abs(budget_value) * 100) if budget_value != 0 else None
            updates["higher_is_better"] = definition.higher_is_better

    benchmark = benchmarks_by_metric_key.get(m.metric_key)
    if benchmark is not None:
        benchmark_value = float(benchmark.benchmark_value)
        updates["benchmark_value"] = benchmark_value
        updates["vs_benchmark_pct"] = (
            (value - benchmark_value) / abs(benchmark_value) * 100 if benchmark_value != 0 else None
        )
        updates["benchmark_source"] = benchmark.source
        updates["benchmark_period_label"] = benchmark.period_label
        updates.setdefault("higher_is_better", definition.higher_is_better if definition else True)

    return base.model_copy(update=updates) if updates else base


@router.get("/companies/{company_id}/metrics", response_model=MetricsResponse)
async def get_metrics(
    company_id: uuid.UUID,
    period: date | None = Query(None, description="Reporting period_end; defaults to the latest available period"),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> MetricsResponse:
    company = await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    metrics, target_period = await get_or_compute_metrics(
        db, organization_id=tenant.org_id, company_id=company_id, period_end=period
    )
    if target_period is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No extracted financial data available for this company",
        )

    period_start = metrics[0].period_start if metrics else target_period
    budgets_by_taxonomy: dict[str, Budget] = {
        b.taxonomy_code: b
        for b in await BudgetRepository(db).list_for_period(
            company_id=company_id, organization_id=tenant.org_id, period_end=target_period
        )
        # A period can have more than one FinancialStatement period_start (e.g. an
        # H1 figure and a trailing-twelve-month figure sharing the same period_end);
        # only compare against a budget set for the exact same period_start too.
        if b.period_start == period_start
    }

    benchmarks_by_metric_key: dict[str, IndustryBenchmark] = {}
    if company.industry:
        for b in await IndustryBenchmarkRepository(db).list_for_industry(
            organization_id=tenant.org_id, industry=company.industry
        ):
            # list_for_industry orders newest-first within each metric_key group,
            # so the first one seen per key is "the" benchmark to use.
            benchmarks_by_metric_key.setdefault(b.metric_key, b)

    grouped: dict[str, list[MetricValue]] = {category.value: [] for category in MetricCategory}
    for m in metrics:
        definition = METRIC_REGISTRY.get(m.metric_key)
        category = definition.category.value if definition else MetricCategory.GROWTH.value
        grouped[category].append(_build_metric_value(m, definition, budgets_by_taxonomy, benchmarks_by_metric_key))

    return MetricsResponse(
        company_id=company_id,
        # company.currency must be kept in sync by the extraction pipeline
        # (see services/extraction/pipeline.py) - this endpoint trusts it
        # verbatim rather than re-deriving it from FinancialStatement rows.
        currency=company.currency,
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
    await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    metric_keys = [k.strip() for k in keys.split(",") if k.strip()]
    await ensure_metrics_for_all_periods(db, organization_id=tenant.org_id, company_id=company_id)

    metrics = await MetricRepository(db).list_history_for_keys(
        company_id=company_id, organization_id=tenant.org_id, metric_keys=metric_keys
    )
    series: dict[str, list[MetricHistoryPoint]] = {key: [] for key in metric_keys}
    for m in metrics:
        if m.value is None:
            # A trend line has no meaningful way to plot "missing" - skip
            # rather than break the series with a fabricated point.
            continue
        series[m.metric_key].append(
            MetricHistoryPoint(period_start=m.period_start, period_end=m.period_end, value=float(m.value))
        )

    return MetricHistoryResponse(company_id=company_id, series=series)
