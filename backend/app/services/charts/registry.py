from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

from app.models.company import Company
from app.models.financial_statement import FinancialStatement
from app.schemas.chart import ChartFormat, ChartPoint, ChartSeries, ChartType, SourceRef
from app.services.metrics.common import PeriodFinancials
from app.services.metrics.fiscal_periods import fiscal_quarter_of, fiscal_year_of
from app.services.metrics.profitability import compute_profitability_metrics

# The five cash flow statement fields a waterfall needs, in display order -
# "base" steps are absolute points (opening/closing balances), "delta" steps
# are additive movements between them. See services/validation/rules.py's
# cash_bridge_sums_to_closing_cash check, which validates these same five
# fields sum correctly before this builder ever runs (only CONFIRMED
# statements reach here - see charts route's exclude_needs_review).
_BRIDGE_STEPS: list[tuple[str, str]] = [
    ("CASH_OPENING", "Opening Cash"),
    ("NET_OPERATING_CASH_FLOW", "Operating"),
    ("NET_INVESTING_CASH_FLOW", "Investing"),
    ("NET_FINANCING_CASH_FLOW", "Financing"),
    ("CASH_CLOSING", "Closing Cash"),
]

# Senus's own publicly stated "Senus 2030" strategy target (see CLAUDE.md §2 -
# "Strategy 'Senus 2030': target >=50% CAGR in sales, 2026-2030"; also
# referenced in the HY2026 filing's own narrative). Not derived from any
# taxonomy field - a stated corporate target, hardcoded here with this
# citation rather than invented, and used only to draw the board's
# growth-vs-target trajectory relative to real extracted REVENUE points.
SENUS_2030_CAGR_TARGET = 0.50

# Same status: a stated management target from the filing's own narrative
# context (Board audience wants to see progress against it), not a taxonomy
# figure - see build_ebitda_margin_card's annotation.
EBITDA_BREAKEVEN_TARGET_FY = "FY2028"

# Sales pipeline figures stated in the HY2026 filing's own highlights text
# ("...pipeline deals of approx. €700k across 21 enterprise customers closed
# in the period (further approx. €500k of open pipeline)") - genuine document
# facts, but not part of the standardized financial-statement taxonomy (this
# is sales/CRM data, not accounting data), so there's no FinancialStatement
# row or ValidationService check backing these two numbers the way every
# other card/chart in this registry is backed. Hardcoded with the source
# excerpt preserved for provenance rather than pretending they're
# statement-derived.
CLOSED_PIPELINE_VALUE = 700_000
OPEN_PIPELINE_VALUE = 500_000
_PIPELINE_SOURCE_EXCERPT = (
    "pipeline deals of approx. €700k across 21 enterprise customers closed in the "
    "period (further approx. €500k of open pipeline)"
)

# Corporate-action milestones from the HY2026 filing's own narrative - like
# the pipeline figures above, genuine document facts that aren't
# taxonomy-coded financial data, so they're hardcoded with their source text
# preserved rather than run through the statement-based builder machinery
# every other chart in this registry uses. Dates are the most precise
# available: exact where the filing states one (the Euronext listing),
# otherwise the reporting period they fell within.
_MILESTONES = [
    {
        "label": "Loamin Ltd. Acquisition",
        "date": "2025-12-31",
        "description": "We completed our first acquisition when we acquired UK based Geospatial AI business Loamin Ltd.",
    },
    {
        "label": "Euronext Access Direct Listing",
        "date": "2025-12-22",
        "description": "Direct Listing on Euronext Access Dublin completed.",
    },
    {
        "label": "€1.1m New Equity Funding",
        "date": "2025-12-31",
        "description": "€1.1m in new equity funding completed.",
    },
]


@dataclass(frozen=True)
class ChartBuildContext:
    # Every CONFIRMED FinancialStatement for this company, across all periods
    # - see api/v1/routes/charts.py, which is the only caller and is
    # responsible for the exclude_needs_review filtering. A builder here must
    # never re-fetch statements itself, so there's exactly one place a
    # needs_review row could leak into a chart.
    statements: list[FinancialStatement]
    company: Company


@dataclass(frozen=True)
class ChartDefinition:
    id: str
    display_name: str
    chart_type: ChartType
    audiences: list[str]
    format: ChartFormat
    # Sort order within an audience's GET .../charts?audience=X response -
    # lower shows first. A single global ordinal (not per-audience) is
    # enough to get a sensible "cards row, then charts" layout on every tab:
    # roughly 1-9 for cards, 10+ for charts/timelines.
    layout_weight: int
    # The "formula" - computed here in code from ctx.statements (or, for the
    # few genuinely non-statement facts like the pipeline/milestone data
    # above, a clearly-documented hardcoded constant), never from
    # LLM-generated chart data or a cached derived value.
    build: Callable[[ChartBuildContext], list[ChartSeries]]
    annotation: str | None = None


def _distinct_periods(statements: list[FinancialStatement]) -> list[tuple[date, date, str]]:
    periods = {(s.period_start, s.period_end, s.period_type.value) for s in statements}
    return sorted(periods, key=lambda p: p[1])


def _statement_by_code_for_period(
    statements: list[FinancialStatement], period_start: date, period_end: date
) -> dict[str, FinancialStatement]:
    return {
        s.taxonomy_code: s
        for s in statements
        if s.period_start == period_start and s.period_end == period_end
    }


def _latest_period_statements(ctx: ChartBuildContext) -> tuple[tuple[date, date, str], dict[str, FinancialStatement]] | None:
    periods = _distinct_periods(ctx.statements)
    if not periods:
        return None
    latest = periods[-1]
    return latest, _statement_by_code_for_period(ctx.statements, latest[0], latest[1])


def _period_months(period_start: date, period_end: date) -> float:
    return ((period_end - period_start).days + 1) / 30.44


def _source_ref(statement: FinancialStatement) -> SourceRef:
    return SourceRef(
        statement_id=statement.id,
        taxonomy_code=statement.taxonomy_code,
        source_excerpt=statement.source_excerpt,
        source_page=statement.source_page,
    )


def _period_fields(
    period_start: date, period_end: date, period_type: str, *, fiscal_year_start_month: int
) -> dict:
    fiscal_year = fiscal_year_of(period_start, fiscal_year_start_month=fiscal_year_start_month)
    fiscal_quarter = (
        fiscal_quarter_of(period_start, fiscal_year_start_month=fiscal_year_start_month)
        if period_type == "Q"
        else None
    )
    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "period_type": period_type,
        "fiscal_year": fiscal_year,
        "fiscal_quarter": fiscal_quarter,
    }


def _single_code_card(ctx: ChartBuildContext, code: str, *, label: str) -> list[ChartSeries]:
    """Shared shape for a "latest period, one taxonomy code, one card" chart -
    used by several of the simple cards below (opex, shares outstanding, new
    equity raised, etc.) so each doesn't hand-roll the same lookup."""
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    (period_start, period_end, period_type), by_code = latest
    statement = by_code.get(code)
    if statement is None:
        return []
    point = ChartPoint(
        **_period_fields(period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month),
        value=float(statement.value),
        source_refs=[_source_ref(statement)],
    )
    return [ChartSeries(label=label, points=[point])]


def build_revenue_trend(ctx: ChartBuildContext) -> list[ChartSeries]:
    points: list[ChartPoint] = []
    for period_start, period_end, period_type in _distinct_periods(ctx.statements):
        by_code = _statement_by_code_for_period(ctx.statements, period_start, period_end)
        revenue_statement = by_code.get("REVENUE")
        if revenue_statement is None:
            continue
        points.append(
            ChartPoint(
                **_period_fields(
                    period_start, period_end, period_type,
                    fiscal_year_start_month=ctx.company.fiscal_year_start_month,
                ),
                value=float(revenue_statement.value),
                source_refs=[_source_ref(revenue_statement)],
            )
        )
    return [ChartSeries(label="Revenue", points=points)]


def build_revenue_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    """A single-point "card" chart carrying the most recent period's Revenue
    with its source_refs - what a MetricCard's click-to-reveal-provenance
    popover reads from (see MetricCard.tsx), same underlying figure as
    revenue_trend's last point but exposed as its own chart_type="card" entry
    per the registry's audiences/format-per-chart-type contract."""
    return _single_code_card(ctx, "REVENUE", label="Revenue")


def build_gross_margin_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    (period_start, period_end, period_type), by_code = latest
    values = {code: float(s.value) for code, s in by_code.items()}
    result = next(
        r for r in compute_profitability_metrics(PeriodFinancials(period_start, period_end, values))
        if r.key == "gross_margin"
    )
    if result.value is None:
        return []
    refs = [_source_ref(by_code[c]) for c in ("REVENUE", "GROSS_PROFIT", "COST_OF_GOODS_SOLD") if c in by_code]
    point = ChartPoint(
        **_period_fields(period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month),
        value=result.value,
        source_refs=refs,
    )
    return [ChartSeries(label="Gross Margin", points=[point])]


def build_opex_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    return _single_code_card(ctx, "OPERATING_EXPENSES", label="Operating Expenses")


def build_monthly_burn_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    """abs(net_operating_cash_flow) / months_in_period - the same burn-rate
    figure cash_runway_months divides cash by (see
    services/metrics/cash.py), exposed as its own card."""
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    (period_start, period_end, period_type), by_code = latest
    operating_cash_flow_statement = by_code.get("NET_OPERATING_CASH_FLOW")
    if operating_cash_flow_statement is None or float(operating_cash_flow_statement.value) >= 0:
        return []
    monthly_burn = abs(float(operating_cash_flow_statement.value)) / _period_months(period_start, period_end)
    point = ChartPoint(
        **_period_fields(period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month),
        value=monthly_burn,
        source_refs=[_source_ref(operating_cash_flow_statement)],
    )
    return [ChartSeries(label="Monthly Cash Burn", points=[point])]


def build_cash_runway_months_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    (period_start, period_end, period_type), by_code = latest
    cash_statement = by_code.get("CASH_AND_EQUIVALENTS")
    ocf_statement = by_code.get("NET_OPERATING_CASH_FLOW")
    if cash_statement is None or ocf_statement is None or float(ocf_statement.value) >= 0:
        return []
    monthly_burn = abs(float(ocf_statement.value)) / _period_months(period_start, period_end)
    if monthly_burn <= 0:
        return []
    runway = float(cash_statement.value) / monthly_burn
    point = ChartPoint(
        **_period_fields(period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month),
        value=runway,
        source_refs=[_source_ref(cash_statement), _source_ref(ocf_statement)],
    )
    return [ChartSeries(label="Cash Runway (months)", points=[point])]


def build_margin_breakdown(ctx: ChartBuildContext) -> list[ChartSeries]:
    gross_points: list[ChartPoint] = []
    net_points: list[ChartPoint] = []
    for period_start, period_end, period_type in _distinct_periods(ctx.statements):
        by_code = _statement_by_code_for_period(ctx.statements, period_start, period_end)
        values = {code: float(s.value) for code, s in by_code.items()}
        period_financials = PeriodFinancials(period_start=period_start, period_end=period_end, values=values)
        # Reuses the exact same formula the /metrics endpoint's MetricCard
        # uses (see services/metrics/profitability.py) - one implementation
        # of "what is gross margin", not a second copy for charts.
        results = {r.key: r for r in compute_profitability_metrics(period_financials)}
        fields = _period_fields(
            period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month
        )

        gross_margin = results["gross_margin"]
        if gross_margin.value is not None:
            refs = [_source_ref(by_code[c]) for c in ("REVENUE", "GROSS_PROFIT", "COST_OF_GOODS_SOLD") if c in by_code]
            gross_points.append(ChartPoint(**fields, value=gross_margin.value, source_refs=refs))

        net_margin = results["net_margin"]
        if net_margin.value is not None:
            refs = [_source_ref(by_code[c]) for c in ("REVENUE", "NET_INCOME") if c in by_code]
            net_points.append(ChartPoint(**fields, value=net_margin.value, source_refs=refs))

    return [
        ChartSeries(label="Gross Margin", points=gross_points),
        ChartSeries(label="Net Margin", points=net_points),
    ]


def build_cost_structure(ctx: ChartBuildContext) -> list[ChartSeries]:
    """COGS and Operating (admin) Expenses per period, as two series meant to
    be stacked (chart_type="stacked_bar") - shows what's driving cost
    alongside revenue, rather than only a net margin percentage."""
    cogs_points: list[ChartPoint] = []
    opex_points: list[ChartPoint] = []
    for period_start, period_end, period_type in _distinct_periods(ctx.statements):
        by_code = _statement_by_code_for_period(ctx.statements, period_start, period_end)
        fields = _period_fields(
            period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month
        )
        cogs_statement = by_code.get("COST_OF_GOODS_SOLD")
        if cogs_statement is not None:
            cogs_points.append(ChartPoint(**fields, value=float(cogs_statement.value), source_refs=[_source_ref(cogs_statement)]))
        opex_statement = by_code.get("OPERATING_EXPENSES")
        if opex_statement is not None:
            opex_points.append(ChartPoint(**fields, value=float(opex_statement.value), source_refs=[_source_ref(opex_statement)]))
    return [
        ChartSeries(label="Cost of Goods Sold", points=cogs_points),
        ChartSeries(label="Administrative Expenses", points=opex_points),
    ]


def build_cash_flow_bridge(ctx: ChartBuildContext) -> list[ChartSeries]:
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    _period, by_code = latest

    points: list[ChartPoint] = []
    for code, step_label in _BRIDGE_STEPS:
        statement = by_code.get(code)
        # A waterfall with a step missing is misleading (it'd look like a
        # zero-value step rather than "we don't know") - only show the bridge
        # when the most recent period has all five figures confirmed.
        if statement is None:
            return []
        points.append(ChartPoint(step_label=step_label, value=float(statement.value), source_refs=[_source_ref(statement)]))

    return [ChartSeries(label="Cash Flow Bridge", points=points)]


def build_revenue_yoy_vs_target_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    """Actual YoY revenue growth for the most recent period vs. the Senus
    2030 strategy's stated >=50% CAGR target (see SENUS_2030_CAGR_TARGET) -
    needs two same-period-type points a year apart to compute an actual
    growth rate to compare."""
    periods = _distinct_periods(ctx.statements)
    if len(periods) < 2:
        return []
    latest = periods[-1]
    prior = next(
        (p for p in reversed(periods[:-1]) if p[2] == latest[2] and (latest[1] - p[1]).days in range(300, 430)),
        None,
    )
    if prior is None:
        return []
    latest_by_code = _statement_by_code_for_period(ctx.statements, latest[0], latest[1])
    prior_by_code = _statement_by_code_for_period(ctx.statements, prior[0], prior[1])
    latest_revenue = latest_by_code.get("REVENUE")
    prior_revenue = prior_by_code.get("REVENUE")
    if latest_revenue is None or prior_revenue is None or float(prior_revenue.value) == 0:
        return []
    actual_growth_pct = (float(latest_revenue.value) - float(prior_revenue.value)) / abs(float(prior_revenue.value)) * 100
    point = ChartPoint(
        **_period_fields(latest[0], latest[1], latest[2], fiscal_year_start_month=ctx.company.fiscal_year_start_month),
        value=actual_growth_pct,
        source_refs=[_source_ref(latest_revenue), _source_ref(prior_revenue)],
    )
    return [ChartSeries(label=f"Revenue YoY Growth (target ≥{SENUS_2030_CAGR_TARGET * 100:.0f}%)", points=[point])]


def build_ebitda_margin_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    (period_start, period_end, period_type), by_code = latest
    values = {code: float(s.value) for code, s in by_code.items()}
    result = next(
        r for r in compute_profitability_metrics(PeriodFinancials(period_start, period_end, values)) if r.key == "ebitda_margin"
    )
    if result.value is None:
        return []
    refs = [_source_ref(by_code[c]) for c in ("REVENUE", "OPERATING_INCOME", "DEPRECIATION", "EBITDA") if c in by_code]
    point = ChartPoint(
        **_period_fields(period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month),
        value=result.value,
        source_refs=refs,
    )
    return [ChartSeries(label="EBITDA Margin", points=[point])]


def build_closed_pipeline_card(_ctx: ChartBuildContext) -> list[ChartSeries]:
    """Hardcoded from the filing's own highlights text (see
    CLOSED_PIPELINE_VALUE's module-level docstring) - not statement-derived,
    so there's no per-company variation here yet; always returns the same
    figure regardless of ctx until sales-pipeline data has its own taxonomy."""
    point = ChartPoint(value=float(CLOSED_PIPELINE_VALUE), source_refs=[], description=_PIPELINE_SOURCE_EXCERPT)
    return [ChartSeries(label="Closed Pipeline", points=[point])]


def build_growth_vs_target(ctx: ChartBuildContext) -> list[ChartSeries]:
    """Actual REVENUE points plotted alongside a computed trajectory at the
    Senus 2030 strategy's stated >=50% CAGR target, anchored at the earliest
    actual point - lets the Board see how far ahead/behind the stated growth
    target the company actually is."""
    periods = _distinct_periods(ctx.statements)
    actual_points: list[ChartPoint] = []
    for period_start, period_end, period_type in periods:
        by_code = _statement_by_code_for_period(ctx.statements, period_start, period_end)
        revenue_statement = by_code.get("REVENUE")
        if revenue_statement is None:
            continue
        actual_points.append(
            ChartPoint(
                **_period_fields(period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month),
                value=float(revenue_statement.value),
                source_refs=[_source_ref(revenue_statement)],
            )
        )
    if not actual_points:
        return []
    base_value = actual_points[0].value
    base_year = actual_points[0].fiscal_year or 0
    target_points: list[ChartPoint] = []
    for p in actual_points:
        years_elapsed = (p.fiscal_year or base_year) - base_year
        target_value = base_value * ((1 + SENUS_2030_CAGR_TARGET) ** years_elapsed)
        target_points.append(
            ChartPoint(
                period_start=p.period_start, period_end=p.period_end, period_type=p.period_type,
                fiscal_year=p.fiscal_year, fiscal_quarter=p.fiscal_quarter, value=target_value, source_refs=[],
            )
        )
    return [
        ChartSeries(label="Actual Revenue", points=actual_points),
        ChartSeries(label=f"Senus 2030 Target (≥{SENUS_2030_CAGR_TARGET * 100:.0f}% CAGR)", points=target_points),
    ]


def build_milestone_timeline(_ctx: ChartBuildContext) -> list[ChartSeries]:
    """Corporate-action events from the filing's own narrative (see
    _MILESTONES) - not statement-derived, so this doesn't vary with ctx yet;
    always returns the same fixed set until corporate actions have their own
    taxonomy/table."""
    points = [
        ChartPoint(period_end=m["date"], step_label=m["label"], description=m["description"], value=0, source_refs=[])
        for m in _MILESTONES
    ]
    return [ChartSeries(label="Milestones", points=points)]


def build_shares_outstanding_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    return _single_code_card(ctx, "SHARES_OUTSTANDING", label="Shares Outstanding")


def build_new_equity_raised_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    return _single_code_card(ctx, "NEW_EQUITY_RAISED", label="New Equity Raised")


def build_pipeline_funnel(_ctx: ChartBuildContext) -> list[ChartSeries]:
    """Same hardcoded pipeline figures as build_closed_pipeline_card, shown as
    a two-stage funnel (closed vs. still-open pipeline value)."""
    points = [
        ChartPoint(step_label="Open Pipeline", value=float(OPEN_PIPELINE_VALUE), source_refs=[], description=_PIPELINE_SOURCE_EXCERPT),
        ChartPoint(step_label="Closed Pipeline", value=float(CLOSED_PIPELINE_VALUE), source_refs=[], description=_PIPELINE_SOURCE_EXCERPT),
    ]
    return [ChartSeries(label="Sales Pipeline", points=points)]


def build_net_cash_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    """cash_balance - bank debt (TOTAL_DEBT) - credit's headline "how much
    cash cushion after debt" figure."""
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    (period_start, period_end, period_type), by_code = latest
    cash_statement = by_code.get("CASH_AND_EQUIVALENTS")
    debt_statement = by_code.get("TOTAL_DEBT")
    if cash_statement is None or debt_statement is None:
        return []
    net_cash = float(cash_statement.value) - float(debt_statement.value)
    point = ChartPoint(
        **_period_fields(period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month),
        value=net_cash,
        source_refs=[_source_ref(cash_statement), _source_ref(debt_statement)],
    )
    return [ChartSeries(label="Net Cash", points=[point])]


def _current_ratio_card(ctx: ChartBuildContext, *, include_contingent: bool, label: str) -> list[ChartSeries]:
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    (period_start, period_end, period_type), by_code = latest
    current_assets = by_code.get("CURRENT_ASSETS")
    current_liabilities = by_code.get("CURRENT_LIABILITIES")
    if current_assets is None or current_liabilities is None:
        return []
    liabilities_total = float(current_liabilities.value)
    refs = [_source_ref(current_assets), _source_ref(current_liabilities)]
    if include_contingent:
        contingent = by_code.get("CONTINGENT_CONSIDERATION")
        if contingent is None:
            return []
        liabilities_total += float(contingent.value)
        refs.append(_source_ref(contingent))
    if liabilities_total == 0:
        return []
    ratio = float(current_assets.value) / liabilities_total
    point = ChartPoint(
        **_period_fields(period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month),
        value=ratio,
        source_refs=refs,
    )
    return [ChartSeries(label=label, points=[point])]


def build_current_ratio_excl_contingent_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    return _current_ratio_card(ctx, include_contingent=False, label="Current Ratio (excl. contingent consideration)")


def build_current_ratio_incl_contingent_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    return _current_ratio_card(ctx, include_contingent=True, label="Current Ratio (incl. contingent consideration)")


def build_interest_cover_card(ctx: ChartBuildContext) -> list[ChartSeries]:
    """Operating income / debt service (interest paid) - a classic "times
    interest earned" measure, distinct from DSCR (which uses EBITDA - see
    services/metrics/solvency.py) by using operating income instead. Guarded
    the same way DSCR is: operating income <= 0 makes the ratio not
    meaningful rather than a nonsense negative multiple."""
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    (period_start, period_end, period_type), by_code = latest
    operating_income_statement = by_code.get("OPERATING_INCOME")
    debt_service_statement = by_code.get("DEBT_SERVICE")
    if operating_income_statement is None or debt_service_statement is None:
        return []
    operating_income = float(operating_income_statement.value)
    debt_service = float(debt_service_statement.value)
    if operating_income <= 0 or debt_service == 0:
        return []
    ratio = operating_income / debt_service
    point = ChartPoint(
        **_period_fields(period_start, period_end, period_type, fiscal_year_start_month=ctx.company.fiscal_year_start_month),
        value=ratio,
        source_refs=[_source_ref(operating_income_statement), _source_ref(debt_service_statement)],
    )
    return [ChartSeries(label="Interest Cover", points=[point])]


def build_debt_composition(ctx: ChartBuildContext) -> list[ChartSeries]:
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    _period, by_code = latest
    debt_statement = by_code.get("TOTAL_DEBT")
    contingent_statement = by_code.get("CONTINGENT_CONSIDERATION")
    if debt_statement is None or contingent_statement is None:
        return []
    points = [
        ChartPoint(step_label="Bank Debt", value=float(debt_statement.value), source_refs=[_source_ref(debt_statement)]),
        ChartPoint(
            step_label="Contingent Consideration", value=float(contingent_statement.value),
            source_refs=[_source_ref(contingent_statement)],
        ),
    ]
    return [ChartSeries(label="Debt Composition", points=points)]


# How many future months build_cash_runway_projection projects forward.
_RUNWAY_PROJECTION_MONTHS = 6


def build_cash_runway_projection(ctx: ChartBuildContext) -> list[ChartSeries]:
    """Projects cash balance forward month-by-month at the current burn rate
    (abs(net_operating_cash_flow) / months_in_period) - a genuine computed
    forward projection from real statement fields, not a narrative guess.
    Stops early (never plots negative cash) if the runway is shorter than
    the projection window."""
    latest = _latest_period_statements(ctx)
    if latest is None:
        return []
    (period_start, period_end, period_type), by_code = latest
    cash_statement = by_code.get("CASH_AND_EQUIVALENTS")
    ocf_statement = by_code.get("NET_OPERATING_CASH_FLOW")
    if cash_statement is None or ocf_statement is None or float(ocf_statement.value) >= 0:
        return []
    monthly_burn = abs(float(ocf_statement.value)) / _period_months(period_start, period_end)
    if monthly_burn <= 0:
        return []
    cash = float(cash_statement.value)
    refs = [_source_ref(cash_statement), _source_ref(ocf_statement)]
    points = [ChartPoint(step_label="Today", value=cash, source_refs=refs)]
    for month in range(1, _RUNWAY_PROJECTION_MONTHS + 1):
        cash = max(cash - monthly_burn, 0.0)
        points.append(ChartPoint(step_label=f"+{month}mo", value=cash, source_refs=refs))
        if cash <= 0:
            break
    return [ChartSeries(label="Projected Cash Balance", points=points)]


CHART_REGISTRY: list[ChartDefinition] = [
    # --- shared across multiple audiences ---
    ChartDefinition(
        id="revenue_card", display_name="Revenue", chart_type="card",
        audiences=["management", "board", "equity", "credit"], format="currency", layout_weight=1,
        build=build_revenue_card,
    ),
    ChartDefinition(
        id="revenue_trend", display_name="Revenue Trend", chart_type="line",
        audiences=["management", "board", "equity"], format="currency", layout_weight=10,
        build=build_revenue_trend,
    ),
    ChartDefinition(
        id="margin_breakdown", display_name="Margin Breakdown", chart_type="grouped_bar",
        audiences=["management", "board", "equity"], format="percent", layout_weight=11,
        build=build_margin_breakdown,
    ),
    ChartDefinition(
        id="cash_flow_bridge", display_name="Cash Flow Bridge", chart_type="waterfall",
        audiences=["management", "board", "credit"], format="currency", layout_weight=12,
        build=build_cash_flow_bridge,
    ),
    # --- management ---
    ChartDefinition(
        id="gross_margin_card", display_name="Gross Margin", chart_type="card",
        audiences=["management", "equity"], format="percent", layout_weight=2,
        build=build_gross_margin_card,
    ),
    ChartDefinition(
        id="opex_card", display_name="Operating Expenses", chart_type="card",
        audiences=["management"], format="currency", layout_weight=3,
        build=build_opex_card,
    ),
    ChartDefinition(
        id="monthly_burn_card", display_name="Monthly Cash Burn", chart_type="card",
        audiences=["management"], format="currency", layout_weight=4,
        build=build_monthly_burn_card,
    ),
    ChartDefinition(
        id="cost_structure", display_name="Cost Structure", chart_type="stacked_bar",
        audiences=["management"], format="currency", layout_weight=13,
        build=build_cost_structure,
    ),
    # --- board ---
    ChartDefinition(
        id="revenue_yoy_vs_target_card", display_name="Revenue YoY Growth vs. Target", chart_type="card",
        audiences=["board"], format="percent", layout_weight=2,
        build=build_revenue_yoy_vs_target_card,
    ),
    ChartDefinition(
        id="ebitda_margin_card", display_name="EBITDA Margin", chart_type="card",
        audiences=["board"], format="percent", layout_weight=3,
        build=build_ebitda_margin_card,
        annotation=f"Target: EBITDA breakeven by {EBITDA_BREAKEVEN_TARGET_FY}",
    ),
    ChartDefinition(
        id="cash_runway_months_card", display_name="Cash Runway", chart_type="card",
        audiences=["board"], format="months", layout_weight=5,
        build=build_cash_runway_months_card,
        annotation="Formula: cash balance ÷ (|net operating cash flow| ÷ months in period)",
    ),
    ChartDefinition(
        id="closed_pipeline_card", display_name="Closed Pipeline", chart_type="card",
        audiences=["board"], format="currency", layout_weight=6,
        build=build_closed_pipeline_card,
    ),
    ChartDefinition(
        id="growth_vs_target", display_name="Growth vs. Senus 2030 Target", chart_type="line",
        audiences=["board"], format="currency", layout_weight=14,
        build=build_growth_vs_target,
    ),
    ChartDefinition(
        id="milestone_timeline", display_name="Milestones", chart_type="milestone",
        audiences=["board"], format="count", layout_weight=15,
        build=build_milestone_timeline,
    ),
    # --- equity ---
    ChartDefinition(
        id="shares_outstanding_card", display_name="Shares Outstanding", chart_type="card",
        audiences=["equity"], format="count", layout_weight=4,
        build=build_shares_outstanding_card,
    ),
    ChartDefinition(
        id="new_equity_raised_card", display_name="New Equity Raised", chart_type="card",
        audiences=["equity"], format="currency", layout_weight=5,
        build=build_new_equity_raised_card,
    ),
    ChartDefinition(
        id="pipeline_funnel", display_name="Sales Pipeline", chart_type="grouped_bar",
        audiences=["equity"], format="currency", layout_weight=14,
        build=build_pipeline_funnel,
    ),
    # --- credit ---
    ChartDefinition(
        id="net_cash_card", display_name="Net Cash", chart_type="card",
        audiences=["credit"], format="currency", layout_weight=2,
        build=build_net_cash_card,
    ),
    ChartDefinition(
        id="current_ratio_excl_card", display_name="Current Ratio (excl. contingent consideration)", chart_type="card",
        audiences=["credit"], format="ratio", layout_weight=3,
        build=build_current_ratio_excl_contingent_card,
    ),
    ChartDefinition(
        id="current_ratio_incl_card", display_name="Current Ratio (incl. contingent consideration)", chart_type="card",
        audiences=["credit"], format="ratio", layout_weight=4,
        build=build_current_ratio_incl_contingent_card,
    ),
    ChartDefinition(
        id="interest_cover_card", display_name="Interest Cover", chart_type="card",
        audiences=["credit"], format="ratio", layout_weight=5,
        build=build_interest_cover_card,
    ),
    ChartDefinition(
        id="debt_composition", display_name="Debt Composition", chart_type="grouped_bar",
        audiences=["credit"], format="currency", layout_weight=15,
        build=build_debt_composition,
    ),
    ChartDefinition(
        id="cash_runway_projection", display_name="Cash Runway Projection", chart_type="line",
        audiences=["credit"], format="currency", layout_weight=16,
        build=build_cash_runway_projection,
    ),
]
