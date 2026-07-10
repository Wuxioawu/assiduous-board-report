from datetime import date

from app.services.metrics.cash import compute_cash_metrics
from app.services.metrics.common import PeriodFinancials
from app.services.metrics.growth import compute_growth_metrics
from app.services.metrics.profitability import compute_profitability_metrics
from app.services.metrics.registry import METRIC_REGISTRY
from app.services.metrics.returns import compute_returns_metrics
from app.services.metrics.solvency import compute_solvency_metrics


def test_every_key_produced_by_the_compute_functions_is_registered():
    """orchestrator.get_or_compute_metrics treats a cached metric set as stale
    whenever `{cached keys} != set(METRIC_REGISTRY.keys())` - so if a compute_*
    function ever emits a key that isn't in METRIC_REGISTRY (or vice versa),
    that comparison can never be satisfied and the app falls into a permanent
    recompute loop (or, the other way around, `METRIC_REGISTRY[r.key]` in
    compute_and_store_metrics raises a KeyError). This test locks the two in
    sync so that failure mode surfaces here instead of at request time.
    """
    empty_period = PeriodFinancials(date(2025, 1, 1), date(2025, 12, 31), values={})

    produced_keys: set[str] = set()
    produced_keys |= {r.key for r in compute_growth_metrics(empty_period, [])}
    produced_keys |= {r.key for r in compute_profitability_metrics(empty_period)}
    produced_keys |= {r.key for r in compute_cash_metrics(empty_period)}
    produced_keys |= {r.key for r in compute_solvency_metrics(empty_period)}
    produced_keys |= {r.key for r in compute_returns_metrics(empty_period)}

    assert produced_keys == set(METRIC_REGISTRY.keys())
