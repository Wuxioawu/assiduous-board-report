from app.services.metrics.common import MetricResult, PeriodFinancials, compute_ebitda, safe_ratio_pct

REVENUE = "REVENUE"
COGS = "COST_OF_GOODS_SOLD"
GROSS_PROFIT = "GROSS_PROFIT"
OPEX = "OPERATING_EXPENSES"
EBITDA = "EBITDA"
OPERATING_INCOME = "OPERATING_INCOME"
DEPRECIATION = "DEPRECIATION"
NET_INCOME = "NET_INCOME"


def compute_profitability_metrics(current: PeriodFinancials) -> list[MetricResult]:
    v = current.values
    revenue = v.get(REVENUE)
    cogs = v.get(COGS)
    opex = v.get(OPEX)
    operating_income = v.get(OPERATING_INCOME)
    depreciation = v.get(DEPRECIATION)
    net_income = v.get(NET_INCOME)

    gross_profit = v.get(GROSS_PROFIT)
    if gross_profit is None and revenue is not None and cogs is not None:
        gross_profit = revenue - cogs

    # See common.compute_ebitda - safe_ratio_pct below preserves whatever
    # sign this computes to, so a loss produces a genuinely negative EBITDA
    # and a negative margin, never silently flipped positive.
    ebitda_is_computed = operating_income is not None and depreciation is not None
    ebitda = compute_ebitda(v)

    def result(key: str, value: float | None, reason: str, missing: list[str]) -> MetricResult:
        if value is not None:
            return MetricResult(key, value)
        return MetricResult(key, None, reason, missing_taxonomy_codes=missing or None)

    def missing_codes(*, needs_revenue: bool, direct_code: str | None, have_direct: bool) -> list[str]:
        codes = []
        if needs_revenue and revenue is None:
            codes.append(REVENUE)
        if direct_code is not None and not have_direct:
            codes.append(direct_code)
        return codes

    gross_margin_missing = missing_codes(
        needs_revenue=True, direct_code=GROSS_PROFIT, have_direct=gross_profit is not None
    )
    ebitda_missing = (
        missing_codes(needs_revenue=True, direct_code=EBITDA, have_direct=ebitda is not None)
        if not ebitda_is_computed
        else ([REVENUE] if revenue is None else [])
    )

    return [
        result(
            "gross_margin",
            safe_ratio_pct(gross_profit, revenue),
            "Revenue and gross profit (or cost of goods sold) not both available",
            gross_margin_missing,
        ),
        result(
            "operating_margin",
            safe_ratio_pct(operating_income, revenue),
            "Revenue and operating income not both available",
            missing_codes(needs_revenue=True, direct_code=OPERATING_INCOME, have_direct=operating_income is not None),
        ),
        result(
            "ebitda_margin",
            safe_ratio_pct(ebitda, revenue),
            "Revenue and EBITDA (operating income + depreciation, or a directly stated EBITDA) not both available",
            ebitda_missing,
        ),
        result(
            "net_margin",
            safe_ratio_pct(net_income, revenue),
            "Revenue and net income not both available",
            missing_codes(needs_revenue=True, direct_code=NET_INCOME, have_direct=net_income is not None),
        ),
        result(
            "ebitda",
            ebitda,
            "Operating income + depreciation (or a directly stated EBITDA) not available",
            [] if ebitda is not None else [OPERATING_INCOME, DEPRECIATION],
        ),
        result("net_income", net_income, "Net income not extracted", [] if net_income is not None else [NET_INCOME]),
        result("operating_expenses", opex, "Operating expenses not extracted", [] if opex is not None else [OPEX]),
        result(
            "cogs_pct_of_revenue",
            safe_ratio_pct(cogs, revenue),
            "Revenue and cost of goods sold not both available",
            missing_codes(needs_revenue=True, direct_code=COGS, have_direct=cogs is not None),
        ),
        result(
            "opex_pct_of_revenue",
            safe_ratio_pct(opex, revenue),
            "Revenue and operating expenses not both available",
            missing_codes(needs_revenue=True, direct_code=OPEX, have_direct=opex is not None),
        ),
    ]
