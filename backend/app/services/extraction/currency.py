from collections import Counter
from collections.abc import Iterable


def detect_reporting_currency(currencies: Iterable[str]) -> str | None:
    """Picks the currency actually used in a batch of extracted line items
    (majority vote, ties broken by first occurrence).

    Returns None for an empty batch so callers can leave Company.currency
    untouched rather than resetting it to a default.
    """
    counts = Counter(currencies)
    if not counts:
        return None
    return counts.most_common(1)[0][0]
