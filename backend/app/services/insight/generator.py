import uuid
from datetime import date
from typing import Literal

import anthropic
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.enums import Audience, InsightSeverity
from app.models.insight import Insight
from app.models.metric import Metric
from app.repositories.company import CompanyRepository
from app.repositories.financial_statement import FinancialStatementRepository
from app.repositories.insight import InsightRepository
from app.services.insight.rendering import render_structured_content_as_text
from app.services.metrics.orchestrator import get_or_compute_metrics
from app.services.metrics.registry import METRIC_REGISTRY


class KeyStat(BaseModel):
    label: str = Field(description="Short stat label, e.g. 'Revenue', 'Gross Margin', 'DSCR'")
    value: str = Field(description="Formatted display value exactly as it should be shown, e.g. '€354,813', '81.7%', '1.4x'")
    trend: Literal["up", "down", "neutral"] = Field(
        description="Direction versus the prior period if available; 'neutral' if flat, not applicable, or no prior-period data exists"
    )
    note: str | None = Field(
        default=None, description="Optional short annotation, e.g. '+4.07% YoY' - omit entirely if not useful"
    )


class InsightSection(BaseModel):
    label: str = Field(description="Section heading, e.g. 'Revenue & Margins', 'Cost Structure & Profitability'")
    summary: str = Field(description="One sentence summarizing this section's takeaway")
    key_stats: list[KeyStat] = Field(description="2-4 key stats for this section, pulled from the provided metrics")
    detail: str = Field(
        description="1-2 short sentences of elaboration or a necessary caveat - not a full paragraph. "
        "The key_stats carry the numbers; this just adds context they can't."
    )


class GeneratedInsight(BaseModel):
    headline: str = Field(
        description="A single punchy verdict sentence capturing the overall takeaway, at most ~110 characters"
    )
    sections: list[InsightSection] = Field(
        description="2-4 labeled sections covering the areas most relevant to this audience"
    )
    watch_items: list[str] = Field(
        description="2-4 short, specific, action-oriented risk or attention flags - phrases, not full paragraphs"
    )
    severity: InsightSeverity


_AUDIENCE_FOCUS = {
    Audience.MANAGEMENT: (
        "the Management team running day-to-day operations. Emphasize revenue and customer growth trends, "
        "margin and cost-structure movement, and cash runway - the levers management can act on this quarter. "
        "Favor sections like 'Revenue & Margins', 'Cost Structure & Profitability', 'Customer Base', and "
        "'Cash & Runway' where the data supports them."
    ),
    Audience.BOARD: (
        "the company's Board of Directors. Give a balanced governance-level view: overall trajectory, "
        "profitability, and any solvency or liquidity risks the board should be aware of. Be candid about "
        "risks as well as progress. Favor sections like 'Growth & Profitability', 'Cash & Liquidity', and "
        "'Solvency & Risk' where the data supports them."
    ),
    Audience.EQUITY: (
        "Equity investors evaluating growth and return on their investment. Emphasize revenue growth "
        "(YoY and MoM), customer growth, ROCE, and margin trajectory - the metrics that drive equity value. "
        "Favor sections like 'Revenue & Growth', 'Margins & Returns', and 'Customer Base' where the data "
        "supports them."
    ),
    Audience.CREDIT: (
        "Credit providers/lenders assessing repayment risk. Emphasize the Debt Service Coverage Ratio, "
        "leverage ratio, cash runway, and working capital - anything bearing on the company's ability to "
        "service its obligations. Flag covenant-relevant risk plainly. Favor sections like 'Debt Service & "
        "Coverage', 'Leverage & Solvency', and 'Cash & Working Capital' where the data supports them."
    ),
}


def _format_metrics(metrics: list[Metric]) -> str:
    by_category: dict[str, list[Metric]] = {}
    for m in metrics:
        if m.value is None:
            # Nothing for the model to reason about - a metric that
            # couldn't be computed for this period is left out of its
            # prompt context entirely, same as before this field started
            # being persisted.
            continue
        definition = METRIC_REGISTRY.get(m.metric_key)
        category = definition.category.value if definition else "other"
        by_category.setdefault(category, []).append(m)

    lines: list[str] = []
    for category, items in by_category.items():
        lines.append(f"[{category}]")
        for m in items:
            lines.append(f"- {m.metric_label} ({m.metric_key}): {float(m.value):.2f} {m.unit or ''}".strip())
    return "\n".join(lines)


def _build_system_prompt(audience: Audience) -> str:
    return (
        "You are a financial analyst writing board-report commentary for "
        f"{_AUDIENCE_FOCUS[audience]}\n\n"
        "You are given the company's computed financial metrics for the current reporting period, its "
        "reporting currency, and, when available, the prior period's metrics for trend context.\n\n"
        "Output a STRUCTURED result (headline, sections, watch_items, severity), not freeform prose:\n"
        "- headline: a single punchy verdict sentence - the one-line takeaway a reader gets even if they "
        "read nothing else.\n"
        "- sections: 2-4 labeled sections appropriate for this audience (see labels suggested above). Each "
        "section's key_stats should pull out the specific numbers backing it - format currency using the "
        "given reporting currency's symbol with thousands separators (e.g. €354,813), percentages to one "
        "decimal place (e.g. 81.7%), and ratios with an 'x' suffix (e.g. 1.4x). Set trend to 'up'/'down' "
        "only when prior-period data supports the comparison, otherwise 'neutral'. The section's `detail` "
        "field is 1-2 sentences, not a paragraph - the key_stats already carry the numbers.\n"
        "- watch_items: 2-4 short, specific, action-oriented flags (e.g. 'Customer count declined 84.78% "
        "(138 → 21) - concentration risk'), not prose sentences.\n\n"
        "Rules:\n"
        "- Base every claim strictly on the metrics provided. Never invent a number that isn't given.\n"
        "- If a metric needed for a claim is missing, say so or omit the claim - do not guess.\n"
        "- severity should be 'critical' if a key metric for this audience signals serious risk "
        "(e.g. negative cash runway, DSCR below 1.0 for credit providers), 'warning' for a notable "
        "concern worth flagging, and 'info' otherwise."
    )


def _build_user_message(
    company_name: str,
    currency: str,
    period_end: date,
    current: list[Metric],
    prior: list[Metric] | None,
) -> str:
    parts = [
        f"Company: {company_name}",
        f"Reporting currency: {currency}",
        f"Reporting period ending: {period_end.isoformat()}",
        "",
        "Current period metrics:",
        _format_metrics(current) or "(none available)",
    ]
    if prior:
        parts += ["", "Prior period metrics (for trend comparison):", _format_metrics(prior)]
    return "\n".join(parts)


async def _get_prior_period_metrics(
    db: AsyncSession, *, organization_id: uuid.UUID, company_id: uuid.UUID, period_end: date
) -> list[Metric] | None:
    period_ends = await FinancialStatementRepository(db).list_period_ends(
        company_id=company_id, organization_id=organization_id
    )
    earlier = [p for p in period_ends if p < period_end]
    if not earlier:
        return None
    prior_period_end = max(earlier)
    metrics, _ = await get_or_compute_metrics(
        db, organization_id=organization_id, company_id=company_id, period_end=prior_period_end
    )
    return metrics


async def generate_narrative_insight(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    company_id: uuid.UUID,
    audience: Audience,
    period_end: date | None = None,
) -> Insight | None:
    """Generates (or regenerates) the cached AI narrative for one company/period/audience.
    Returns None if the company has no extracted financial data at all."""
    metrics, target_period = await get_or_compute_metrics(
        db, organization_id=organization_id, company_id=company_id, period_end=period_end
    )
    if target_period is None:
        return None

    company = await CompanyRepository(db).get_by_id(company_id, organization_id=organization_id)
    company_name = company.name if company else "the company"
    currency = company.currency if company else "USD"

    prior_metrics = await _get_prior_period_metrics(
        db, organization_id=organization_id, company_id=company_id, period_end=target_period
    )

    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.parse(
        model=settings.insight_model,
        max_tokens=2000,
        system=_build_system_prompt(audience),
        messages=[
            {
                "role": "user",
                "content": _build_user_message(company_name, currency, target_period, metrics, prior_metrics),
            }
        ],
        output_format=GeneratedInsight,
    )
    generated = response.parsed_output

    period_start = metrics[0].period_start if metrics else target_period

    insight_repo = InsightRepository(db)
    await insight_repo.delete_for_period_audience(
        company_id=company_id,
        organization_id=organization_id,
        period_end=target_period,
        audience=audience.value,
    )
    insight = await insight_repo.create(
        organization_id=organization_id,
        company_id=company_id,
        audience=audience.value,
        period_start=period_start,
        period_end=target_period,
        insight_type="narrative_commentary",
        title=generated.headline,
        body=render_structured_content_as_text(generated.model_dump(exclude={"severity"})),
        # severity excluded here - it's already stored on its own column below, so
        # keeping it out of the JSON blob too avoids two sources of truth for it.
        structured_content=generated.model_dump(exclude={"severity"}),
        severity=generated.severity,
        source_metric_ids=[str(m.id) for m in metrics],
    )
    await db.commit()
    return insight


async def get_or_generate_insight(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    company_id: uuid.UUID,
    audience: Audience,
    period_end: date | None = None,
) -> Insight | None:
    """Returns the cached insight for a period/audience, generating it first if missing."""
    target_period = period_end
    if target_period is None:
        target_period = await FinancialStatementRepository(db).get_latest_period_end(
            company_id=company_id, organization_id=organization_id
        )
        if target_period is None:
            return None

    cached = await InsightRepository(db).get_for_period_audience(
        company_id=company_id,
        organization_id=organization_id,
        period_end=target_period,
        audience=audience.value,
    )
    if cached is not None:
        return cached

    return await generate_narrative_insight(
        db,
        organization_id=organization_id,
        company_id=company_id,
        audience=audience,
        period_end=target_period,
    )
