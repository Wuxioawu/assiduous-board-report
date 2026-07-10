from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class PeriodFinancials:
    """One reporting period's extracted taxonomy_code -> value map."""

    period_start: date
    period_end: date
    values: dict[str, float]


@dataclass
class MetricResult:
    key: str
    value: float | None
    reason: str | None = None


def period_length_days(period: PeriodFinancials) -> int:
    return (period.period_end - period.period_start).days + 1


def period_length_months(period: PeriodFinancials) -> float:
    return period_length_days(period) / 30.44


def previous_period(
    history: list[PeriodFinancials], current: PeriodFinancials
) -> PeriodFinancials | None:
    """The chronologically preceding period, regardless of its length or gap."""
    candidates = [p for p in history if p.period_end < current.period_end]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.period_end)


def period_offset_by_days(
    history: list[PeriodFinancials],
    current: PeriodFinancials,
    *,
    target_gap_days: int,
    gap_tolerance_days: int,
    length_tolerance_ratio: float = 0.3,
) -> PeriodFinancials | None:
    """Finds the period roughly `target_gap_days` before `current` with a
    comparable length (e.g. same-period-last-year, or same-period-last-month)."""
    current_len = period_length_days(current)
    best: PeriodFinancials | None = None
    best_diff: int | None = None
    for p in history:
        if p.period_start == current.period_start and p.period_end == current.period_end:
            continue
        gap = (current.period_end - p.period_end).days
        if gap <= 0:
            continue
        diff = abs(gap - target_gap_days)
        if diff > gap_tolerance_days:
            continue
        p_len = period_length_days(p)
        if abs(p_len - current_len) > current_len * length_tolerance_ratio:
            continue
        if best is None or diff < best_diff:
            best, best_diff = p, diff
    return best


def pct_change(new: float | None, old: float | None) -> float | None:
    if new is None or old is None or old == 0:
        return None
    return (new - old) / abs(old) * 100


def safe_ratio_pct(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator * 100
