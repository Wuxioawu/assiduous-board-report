from datetime import date

import pytest

from app.services.metrics.common import PeriodFinancials
from app.services.metrics.profitability import compute_profitability_metrics


def _by_key(values):
    period = PeriodFinancials(date(2025, 1, 1), date(2025, 12, 31), values)
    return {r.key: r for r in compute_profitability_metrics(period)}


def test_margins_computed_when_every_line_item_is_present():
    results = _by_key(
        {
            "REVENUE": 1_000_000,
            "COST_OF_GOODS_SOLD": 400_000,
            "GROSS_PROFIT": 600_000,
            "OPERATING_EXPENSES": 300_000,
            "EBITDA": 250_000,
            "OPERATING_INCOME": 200_000,
            "NET_INCOME": 150_000,
        }
    )

    assert results["gross_margin"].value == pytest.approx(60.0)
    assert results["operating_margin"].value == pytest.approx(20.0)
    assert results["ebitda_margin"].value == pytest.approx(25.0)
    assert results["net_margin"].value == pytest.approx(15.0)
    assert results["ebitda"].value == 250_000
    assert results["net_income"].value == 150_000
    assert results["operating_expenses"].value == 300_000
    assert results["cogs_pct_of_revenue"].value == pytest.approx(40.0)
    assert results["opex_pct_of_revenue"].value == pytest.approx(30.0)


def test_gross_profit_is_derived_from_revenue_minus_cogs_when_not_extracted_directly():
    results = _by_key({"REVENUE": 1_000_000, "COST_OF_GOODS_SOLD": 400_000})

    assert results["gross_margin"].value == pytest.approx(60.0)
    # Derived successfully, so GROSS_PROFIT itself shouldn't show up as missing.
    assert results["gross_margin"].missing_taxonomy_codes is None


def test_missing_revenue_blocks_every_margin_and_names_revenue_as_missing():
    results = _by_key({"COST_OF_GOODS_SOLD": 400_000, "EBITDA": 250_000})

    for key in ("gross_margin", "operating_margin", "ebitda_margin", "net_margin"):
        assert results[key].value is None
        assert "REVENUE" in results[key].missing_taxonomy_codes

    assert results["ebitda"].value == 250_000
    assert results["net_income"].value is None
    assert results["net_income"].missing_taxonomy_codes == ["NET_INCOME"]


def test_gross_margin_missing_direct_code_when_neither_gross_profit_nor_cogs_available():
    results = _by_key({"REVENUE": 1_000_000})

    assert results["gross_margin"].value is None
    assert results["gross_margin"].missing_taxonomy_codes == ["GROSS_PROFIT"]
