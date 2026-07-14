import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import TenantContext, get_or_404, get_tenant_context
from app.db.session import get_db
from app.repositories.company import CompanyRepository
from app.repositories.financial_statement import FinancialStatementRepository
from app.schemas.chart import ChartConfig
from app.services.charts.registry import CHART_REGISTRY, ChartBuildContext

router = APIRouter(tags=["charts"])

# A "line" chart with fewer than this many points reads as a trend, but a
# trend needs at least 3 points to show a trajectory - two points is just a
# single change, better shown as a plain comparison. Shared here (the one
# place every ChartConfig passes through before reaching the frontend) so no
# individual chart builder or frontend component has to remember this rule.
_MIN_POINTS_FOR_LINE_CHART = 3


def _degrade_line_charts_with_too_few_points(config: ChartConfig) -> ChartConfig:
    if config.chart_type != "line":
        return config
    longest_series = max((len(s.points) for s in config.series), default=0)
    if longest_series >= _MIN_POINTS_FOR_LINE_CHART:
        return config
    return config.model_copy(update={"chart_type": "grouped_bar"})


@router.get("/companies/{company_id}/charts", response_model=list[ChartConfig])
async def get_charts(
    company_id: uuid.UUID,
    audience: str | None = Query(
        None, description="Filter to one audience's charts (management|board|equity|credit); omit for all."
    ),
    tenant: TenantContext = Depends(get_tenant_context),
    db: AsyncSession = Depends(get_db),
) -> list[ChartConfig]:
    """Ready-to-render chart configs computed ONLY from CONFIRMED
    FinancialStatement rows (see ValidationService) - never from LLM-generated
    chart data, and never from a statement that failed an accounting-identity
    check. See services/charts/registry.py's CHART_REGISTRY for the single
    source of truth each chart's formula/chart_type/audiences/format/
    layout_weight come from - no chart component on the frontend hardcodes
    any of that. Ordered by layout_weight (ascending) once filtered to
    `audience`, if given."""
    company = await get_or_404(
        lambda: CompanyRepository(db).get_by_id(company_id, organization_id=tenant.org_id),
        detail="Company not found",
    )

    statements = await FinancialStatementRepository(db).list_for_company(
        company_id=company_id, organization_id=tenant.org_id, exclude_needs_review=True
    )
    ctx = ChartBuildContext(statements=statements, company=company)

    definitions = CHART_REGISTRY
    if audience is not None:
        definitions = [d for d in definitions if audience in d.audiences]
    definitions = sorted(definitions, key=lambda d: d.layout_weight)

    configs: list[ChartConfig] = []
    for definition in definitions:
        series = definition.build(ctx)
        if not any(s.points for s in series):
            # Nothing this chart can show yet (e.g. no confirmed cash flow
            # statement fields for any period) - omit it rather than send an
            # empty shell the frontend has to special-case.
            continue
        config = ChartConfig(
            id=definition.id,
            display_name=definition.display_name,
            chart_type=definition.chart_type,
            audiences=definition.audiences,
            format=definition.format,
            annotation=definition.annotation,
            series=series,
        )
        configs.append(_degrade_line_charts_with_too_few_points(config))
    return configs
