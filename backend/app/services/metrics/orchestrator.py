import hashlib
import uuid
from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.financial_statement import FinancialStatement
from app.models.metric import Metric
from app.repositories.financial_statement import FinancialStatementRepository
from app.repositories.metric import MetricRepository
from app.services.metrics.cash import compute_cash_metrics
from app.services.metrics.common import MetricResult, PeriodFinancials
from app.services.metrics.growth import compute_growth_metrics
from app.services.metrics.profitability import compute_profitability_metrics
from app.services.metrics.registry import METRIC_REGISTRY
from app.services.metrics.returns import compute_returns_metrics
from app.services.metrics.solvency import compute_solvency_metrics


def _recompute_lock_key(company_id: uuid.UUID, period_end: date) -> int:
    """A stable (not hash()-randomized) signed 64-bit key for pg_advisory_xact_lock,
    scoping the lock to one company+period so unrelated periods/companies don't
    contend with each other."""
    digest = hashlib.sha256(f"{company_id}:{period_end.isoformat()}".encode()).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


def _build_period_history(statements: list[FinancialStatement]) -> list[PeriodFinancials]:
    periods: dict[tuple[date, date], dict[str, float]] = {}
    for s in statements:
        key = (s.period_start, s.period_end)
        periods.setdefault(key, {})[s.taxonomy_code] = float(s.value)

    history = [
        PeriodFinancials(period_start=start, period_end=end, values=values)
        for (start, end), values in periods.items()
    ]
    history.sort(key=lambda p: p.period_end)
    return history


def _compute_all(current: PeriodFinancials, history: list[PeriodFinancials]) -> list[MetricResult]:
    results: list[MetricResult] = []
    results += compute_growth_metrics(current, history)
    results += compute_profitability_metrics(current)
    results += compute_cash_metrics(current)
    results += compute_solvency_metrics(current)
    results += compute_returns_metrics(current)
    return results


async def compute_and_store_metrics(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    company_id: uuid.UUID,
    period_end: date | None = None,
) -> list[Metric]:
    """Recomputes every applicable metric for one reporting period from the
    company's FinancialStatement rows and overwrites the cached Metric rows
    for that period. Defaults to the most recent period when none is given.

    exclude_needs_review=True: a statement that failed a ValidationService
    identity check must never feed a metric a board sees - see
    FinancialStatementRepository.list_for_company."""
    statements = await FinancialStatementRepository(db).list_for_company(
        company_id=company_id, organization_id=organization_id, exclude_needs_review=True
    )
    if not statements:
        return []

    history = _build_period_history(statements)
    current = (
        next((p for p in history if p.period_end == period_end), None)
        if period_end is not None
        else history[-1]
    )
    if current is None:
        return []

    results = _compute_all(current, history)

    metric_repo = MetricRepository(db)
    await metric_repo.delete_for_period(
        company_id=company_id,
        organization_id=organization_id,
        period_start=current.period_start,
        period_end=current.period_end,
    )

    metrics_to_create = [
        Metric(
            organization_id=organization_id,
            company_id=company_id,
            financial_statement_id=None,
            metric_key=r.key,
            metric_label=METRIC_REGISTRY[r.key].label,
            value=r.value,
            unit=METRIC_REGISTRY[r.key].unit.value,
            period_start=current.period_start,
            period_end=current.period_end,
            reason=r.reason,
            missing_taxonomy_codes=r.missing_taxonomy_codes,
            not_meaningful=r.not_meaningful,
        )
        for r in results
    ]
    created = await metric_repo.create_many(metrics_to_create)

    await db.commit()
    return created


async def get_or_compute_metrics(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    company_id: uuid.UUID,
    period_end: date | None = None,
) -> tuple[list[Metric], date | None]:
    """Returns the cached metrics for a period (computing and caching them
    first if needed) along with the resolved period_end. Defaults to the
    most recent period when none is given."""
    target_period = period_end
    if target_period is None:
        target_period = await FinancialStatementRepository(db).get_latest_period_end(
            company_id=company_id, organization_id=organization_id
        )
        if target_period is None:
            return [], None

    metric_repo = MetricRepository(db)
    metrics = await metric_repo.list_for_period(
        company_id=company_id, organization_id=organization_id, period_end=target_period
    )
    # A cached row per registry key isn't just "some rows exist" - compute_and_store_metrics
    # always writes every METRIC_REGISTRY key for a period (missing ones get a value=None +
    # reason), so any gap between what's cached and the current registry means these rows
    # predate a metric being added (or a partial write) and are stale, not just "uncomputed".
    if {m.metric_key for m in metrics} != set(METRIC_REGISTRY.keys()):
        # Serialize recomputation per company+period: the dashboard fires /metrics and
        # /metrics/history concurrently (the latter recomputes every period via
        # ensure_metrics_for_all_periods below), so two requests can both observe the
        # same stale cache and both run compute_and_store_metrics's delete-then-insert,
        # racing into duplicate rows. The lock auto-releases at this session's commit/
        # rollback, so it only blocks the other concurrent request, not future ones.
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": _recompute_lock_key(company_id, target_period)},
        )
        metrics = await metric_repo.list_for_period(
            company_id=company_id, organization_id=organization_id, period_end=target_period
        )
        if {m.metric_key for m in metrics} != set(METRIC_REGISTRY.keys()):
            metrics = await compute_and_store_metrics(
                db, organization_id=organization_id, company_id=company_id, period_end=target_period
            )
    return metrics, target_period


async def ensure_metrics_for_all_periods(
    db: AsyncSession, *, organization_id: uuid.UUID, company_id: uuid.UUID
) -> None:
    """Makes sure every reporting period with FinancialStatement data has
    cached Metric rows, so multi-period trend queries don't miss periods
    that were never viewed via the single-period metrics endpoint."""
    period_ends = await FinancialStatementRepository(db).list_period_ends(
        company_id=company_id, organization_id=organization_id
    )
    for period_end in period_ends:
        await get_or_compute_metrics(
            db, organization_id=organization_id, company_id=company_id, period_end=period_end
        )
