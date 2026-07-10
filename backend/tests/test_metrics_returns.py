from datetime import date

import pytest

from app.services.metrics.common import PeriodFinancials
from app.services.metrics.returns import compute_returns_metrics


def _roce(values):
    period = PeriodFinancials(date(2025, 1, 1), date(2025, 12, 31), values)
    return compute_returns_metrics(period)[0]


def test_roce_is_operating_income_over_capital_employed():
    result = _roce({"OPERATING_INCOME": 200_000, "TOTAL_ASSETS": 1_000_000, "CURRENT_LIABILITIES": 200_000})
    # capital employed = 1,000,000 - 200,000 = 800,000
    assert result.value == pytest.approx(25.0)


def test_roce_flags_zero_capital_employed_instead_of_dividing_by_zero():
    result = _roce({"OPERATING_INCOME": 200_000, "TOTAL_ASSETS": 200_000, "CURRENT_LIABILITIES": 200_000})
    assert result.value is None
    assert result.reason == "Capital employed (total assets - current liabilities) is zero"


def test_roce_names_every_missing_input():
    result = _roce({"TOTAL_ASSETS": 1_000_000})
    assert result.value is None
    assert set(result.missing_taxonomy_codes) == {"OPERATING_INCOME", "CURRENT_LIABILITIES"}
