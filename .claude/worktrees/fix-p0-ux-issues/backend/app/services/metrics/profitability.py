from app.services.metrics.common import MetricResult, PeriodFinancials, safe_ratio_pct

REVENUE = "REVENUE"
COGS = "COST_OF_GOODS_SOLD"
GROSS_PROFIT = "GROSS_PROFIT"
OPEX = "OPERATING_EXPENSES"
EBITDA = "EBITDA"
OPERATING_INCOME = "OPERATING_INCOME"
NET_INCOME = "NET_INCOME"


def compute_profitability_metrics(current: PeriodFinancials) -> list[MetricResult]:
    v = current.values
    revenue = v.get(REVENUE)

    gross_profit = v.get(GROSS_PROFIT)
    if gross_profit is None and revenue is not None and v.get(COGS) is not None:
        gross_profit = revenue - v[COGS]

    ebitda = v.get(EBITDA)

    def result(key: str, value: float | None, reason: str) -> MetricResult:
        return MetricResult(key, value, None if value is not None else reason)

    return [
        result(
            "gross_margin",
            safe_ratio_pct(gross_profit, revenue),
            "Revenue and gross profit (or cost of goods sold) not both available",
        ),
        result(
            "operating_margin",
            safe_ratio_pct(v.get(OPERATING_INCOME), revenue),
            "Revenue and operating income not both available",
        ),
        result("ebitda_margin", safe_ratio_pct(ebitda, revenue), "Revenue and EBITDA not both available"),
        result("net_margin", safe_ratio_pct(v.get(NET_INCOME), revenue), "Revenue and net income not both available"),
        result("ebitda", ebitda, "EBITDA not extracted"),
        result(
            "cogs_pct_of_revenue",
            safe_ratio_pct(v.get(COGS), revenue),
            "Revenue and cost of goods sold not both available",
        ),
        result(
            "opex_pct_of_revenue",
            safe_ratio_pct(v.get(OPEX), revenue),
            "Revenue and operating expenses not both available",
        ),
    ]
