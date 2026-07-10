from app.services.metrics.common import MetricResult, PeriodFinancials, period_length_months

EBITDA = "EBITDA"
CAPEX = "CAPITAL_EXPENDITURE"
CASH = "CASH_AND_EQUIVALENTS"
CURRENT_ASSETS = "CURRENT_ASSETS"
CURRENT_LIABILITIES = "CURRENT_LIABILITIES"


def compute_cash_metrics(current: PeriodFinancials) -> list[MetricResult]:
    v = current.values
    results: list[MetricResult] = []

    ebitda = v.get(EBITDA)
    capex = v.get(CAPEX)
    results.append(
        MetricResult(
            "capital_expenditure",
            capex,
            None if capex is not None else "Capital expenditure not extracted",
            missing_taxonomy_codes=None if capex is not None else [CAPEX],
        )
    )

    fcf = None
    if ebitda is not None and capex is not None:
        fcf = ebitda - capex
    fcf_missing = [code for code, value in ((EBITDA, ebitda), (CAPEX, capex)) if value is None]
    results.append(
        MetricResult(
            "free_cash_flow",
            fcf,
            None if fcf is not None else "EBITDA and capital expenditure not both available",
            missing_taxonomy_codes=fcf_missing or None,
        )
    )

    cash = v.get(CASH)
    results.append(
        MetricResult(
            "cash_balance",
            cash,
            None if cash is not None else "Cash and cash equivalents not extracted",
            missing_taxonomy_codes=None if cash is not None else [CASH],
        )
    )

    runway: float | None = None
    reason: str | None = None
    runway_missing: list[str] | None = None
    if cash is None:
        reason = "Cash balance not available"
        runway_missing = [CASH]
    elif fcf is None:
        reason = "Free cash flow not available to estimate the burn rate"
        runway_missing = fcf_missing or None
    elif fcf >= 0:
        reason = "Company is free-cash-flow positive; runway is not applicable"
    else:
        monthly_burn = -fcf / period_length_months(current)
        runway = cash / monthly_burn if monthly_burn > 0 else None
        if runway is None:
            reason = "Unable to compute a positive monthly burn rate"
    results.append(MetricResult("cash_runway_months", runway, reason, missing_taxonomy_codes=runway_missing))

    current_assets = v.get(CURRENT_ASSETS)
    current_liabilities = v.get(CURRENT_LIABILITIES)
    working_capital = None
    if current_assets is not None and current_liabilities is not None:
        working_capital = current_assets - current_liabilities
    working_capital_missing = [
        code for code, value in ((CURRENT_ASSETS, current_assets), (CURRENT_LIABILITIES, current_liabilities)) if value is None
    ]
    results.append(
        MetricResult(
            "working_capital",
            working_capital,
            None if working_capital is not None else "Current assets and current liabilities not both available",
            missing_taxonomy_codes=working_capital_missing or None,
        )
    )

    return results
