import uuid
from datetime import UTC, date, datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML

from app.models.budget import Budget
from app.models.company import Company
from app.models.enums import Audience, PeriodType
from app.repositories.budget import BudgetRepository
from app.services.insight.generator import get_or_generate_insight
from app.services.insight.rendering import render_structured_content_as_text
from app.services.metrics.fiscal_periods import (
    classify_period_type,
    fiscal_quarter_of,
    fiscal_year_of,
    format_period_label,
)
from app.services.metrics.orchestrator import get_or_compute_metrics
from app.services.metrics.registry import METRIC_REGISTRY, MetricCategory

_TEMPLATE_DIR = Path(__file__).parent / "templates"
_env = Environment(loader=FileSystemLoader(_TEMPLATE_DIR), autoescape=select_autoescape(["html"]))

SECTION_TITLES: dict[Audience, str] = {
    Audience.MANAGEMENT: "Management Overview",
    Audience.BOARD: "Board Summary",
    Audience.EQUITY: "Equity Investor View",
    Audience.CREDIT: "Credit Provider View",
}

# Which metric categories are surfaced per section, mirroring the emphasis of the
# dashboard's audience-specific views (see ReportView.tsx).
_AUDIENCE_CATEGORIES: dict[Audience, list[MetricCategory]] = {
    Audience.MANAGEMENT: [MetricCategory.GROWTH, MetricCategory.PROFITABILITY, MetricCategory.CASH],
    Audience.BOARD: [MetricCategory.GROWTH, MetricCategory.PROFITABILITY, MetricCategory.SOLVENCY],
    Audience.EQUITY: [MetricCategory.GROWTH, MetricCategory.RETURNS, MetricCategory.PROFITABILITY],
    Audience.CREDIT: [MetricCategory.SOLVENCY, MetricCategory.CASH],
}

_CATEGORY_LABELS: dict[MetricCategory, str] = {
    MetricCategory.GROWTH: "Growth & Revenue",
    MetricCategory.PROFITABILITY: "Profitability",
    MetricCategory.CASH: "Cash & Liquidity",
    MetricCategory.SOLVENCY: "Solvency & Leverage",
    MetricCategory.RETURNS: "Returns",
}

_CURRENCY_SYMBOLS = {"USD": "$", "EUR": "€", "GBP": "£"}


def _format_currency(value: float, currency: str) -> str:
    symbol = _CURRENCY_SYMBOLS.get(currency, f"{currency} ")
    sign = "-" if value < 0 else ""
    abs_value = abs(value)
    if abs_value >= 1_000_000_000:
        return f"{sign}{symbol}{abs_value / 1_000_000_000:.1f}B"
    if abs_value >= 1_000_000:
        return f"{sign}{symbol}{abs_value / 1_000_000:.1f}M"
    if abs_value >= 1_000:
        return f"{sign}{symbol}{abs_value / 1_000:.1f}K"
    return f"{sign}{symbol}{abs_value:.1f}"


def format_metric_value(value: float, unit: str, currency: str) -> str:
    if unit == "currency":
        return _format_currency(value, currency)
    if unit == "percentage":
        return f"{value:.1f}%"
    if unit == "ratio":
        return f"{value:.1f}x"
    if unit == "months":
        return "120+ mo" if value > 120 else f"{value:.1f} mo"
    return f"{value:,.0f}"


_FAVORABLE_COLOR = "#0ca30c"
_UNFAVORABLE_COLOR = "#d03b3b"


def _build_variance(m, definition, currency: str, budgets_by_taxonomy: dict[str, Budget]) -> dict | None:
    if definition is None or definition.budget_taxonomy_code is None:
        return None
    budget = budgets_by_taxonomy.get(definition.budget_taxonomy_code)
    if budget is None:
        return None

    actual = float(m.value)
    budget_value = float(budget.value)
    variance_pct = (actual - budget_value) / abs(budget_value) * 100 if budget_value != 0 else None

    if variance_pct is None:
        variance_text = "n/a"
        color = "#6b7280"
    else:
        favorable = (variance_pct >= 0) == definition.higher_is_better
        arrow = "▲" if variance_pct >= 0 else "▼"
        variance_text = f"{arrow} {variance_pct:+.1f}%"
        color = _FAVORABLE_COLOR if favorable else _UNFAVORABLE_COLOR

    return {
        "budget_value": format_metric_value(budget_value, m.unit or "", currency),
        "variance_text": variance_text,
        "color": color,
    }


def _build_metric_groups(
    metrics: list, audience: Audience, currency: str, budgets_by_taxonomy: dict[str, Budget]
) -> list[dict]:
    groups: list[dict] = []
    for category in _AUDIENCE_CATEGORIES[audience]:
        rows = []
        for m in metrics:
            definition = METRIC_REGISTRY.get(m.metric_key)
            if definition is None or definition.category != category:
                continue
            if m.value is None:
                # A printed board pack has no room for a hover explanation -
                # a metric that couldn't be computed is left off the page
                # entirely, same as before this field started being persisted.
                continue
            rows.append(
                {
                    "label": m.metric_label,
                    "value": format_metric_value(float(m.value), m.unit or "", currency),
                    "variance": _build_variance(m, definition, currency, budgets_by_taxonomy),
                }
            )
        if rows:
            groups.append({"label": _CATEGORY_LABELS[category], "rows": rows})
    return groups


async def render_report_pdf(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    company: Company,
    sections: list[Audience],
    period_end: date | None,
) -> tuple[bytes | None, date | None, date | None]:
    """Renders a single combined board report PDF covering every requested audience
    section for one company/period. Returns (None, None, None) if the company has
    no extracted financial data at all for the resolved period."""
    metrics, target_period = await get_or_compute_metrics(
        db, organization_id=organization_id, company_id=company.id, period_end=period_end
    )
    if target_period is None:
        return None, None, None

    period_start = metrics[0].period_start if metrics else target_period
    budgets_by_taxonomy: dict[str, Budget] = {
        b.taxonomy_code: b
        for b in await BudgetRepository(db).list_for_period(
            company_id=company.id, organization_id=organization_id, period_end=target_period
        )
        if b.period_start == period_start
    }

    section_contexts: list[dict] = []
    for audience in sections:
        insight = await get_or_generate_insight(
            db, organization_id=organization_id, company_id=company.id, audience=audience, period_end=target_period
        )
        # A human edit takes precedence over the AI draft - exported reports must
        # reflect the team's final-reviewed commentary, not a stale AI version, the
        # same way InsightPanel prefers edited_content over structured_content.
        insight_title = insight.title if insight else None
        insight_body_text = insight.body if insight else ""
        if insight is not None and insight.is_edited and insight.edited_content:
            insight_title = insight.edited_content.get("headline", insight_title)
            insight_body_text = render_structured_content_as_text(insight.edited_content)

        section_contexts.append(
            {
                "section_title": SECTION_TITLES[audience],
                "metric_groups": _build_metric_groups(metrics, audience, company.currency, budgets_by_taxonomy),
                "insight": insight,
                "insight_title": insight_title,
                "insight_paragraphs": (
                    [p.strip() for p in insight_body_text.split("\n\n") if p.strip()] if insight else []
                ),
            }
        )

    # Same derivation routes/metrics.py and routes/companies.py already use -
    # period_type is fully determined by the period's own dates, so the PDF
    # never classifies a period differently than the dashboard did.
    period_type = classify_period_type(period_start, target_period)
    fiscal_year = fiscal_year_of(period_start, fiscal_year_start_month=company.fiscal_year_start_month)
    fiscal_quarter = (
        fiscal_quarter_of(period_start, fiscal_year_start_month=company.fiscal_year_start_month)
        if period_type == PeriodType.Q
        else None
    )

    context = {
        "company_name": company.name,
        "period_start": period_start,
        "period_end": target_period,
        # The single pre-formatted period label string (see fiscal_periods.py's
        # format_period_label, which mirrors frontend lib/periods.ts field-for-
        # field) - the template just prints this rather than building its own
        # secondary date-range text, so the PDF never reads as a different
        # period than the dropdown/header/charts show for the same data.
        "period_label": format_period_label(
            period_type=period_type,
            period_end=target_period,
            fiscal_year=fiscal_year,
            fiscal_quarter=fiscal_quarter,
        ),
        "generated_at": datetime.now(UTC),
        "section_names": [SECTION_TITLES[a] for a in sections],
        "sections": section_contexts,
    }

    template = _env.get_template("report.html")
    html_content = template.render(**context)
    pdf_bytes = HTML(string=html_content).write_pdf()
    return pdf_bytes, period_start, target_period


def build_report_filename(company_name: str, period_start: date | None, period_end: date) -> str:
    start_str = (period_start or period_end).strftime("%Y-%m")
    end_str = period_end.strftime("%Y-%m")
    return f"{company_name} - Board Report - {start_str} to {end_str}.pdf"
