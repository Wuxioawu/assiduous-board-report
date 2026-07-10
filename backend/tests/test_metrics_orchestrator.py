from datetime import date

from app.models.financial_statement import FinancialStatement
from app.services.metrics.orchestrator import _build_period_history


def _stmt(period_start: date, period_end: date, taxonomy_code: str, value: float) -> FinancialStatement:
    return FinancialStatement(
        period_start=period_start,
        period_end=period_end,
        taxonomy_code=taxonomy_code,
        value=value,
        currency="USD",
        extracted_by="ai",
    )


def test_line_items_are_grouped_by_period_and_sorted_chronologically():
    statements = [
        _stmt(date(2025, 2, 1), date(2025, 2, 28), "REVENUE", 200),
        _stmt(date(2025, 1, 1), date(2025, 1, 31), "REVENUE", 100),
        _stmt(date(2025, 1, 1), date(2025, 1, 31), "EBITDA", 10),
    ]

    history = _build_period_history(statements)

    assert [p.period_end for p in history] == [date(2025, 1, 31), date(2025, 2, 28)]
    assert history[0].values == {"REVENUE": 100.0, "EBITDA": 10.0}
    assert history[1].values == {"REVENUE": 200.0}


def test_no_statements_produces_no_periods():
    assert _build_period_history([]) == []
