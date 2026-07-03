from app.services.metrics.common import MetricResult, PeriodFinancials

EBITDA = "EBITDA"
TOTAL_DEBT = "TOTAL_DEBT"
DEBT_SERVICE = "DEBT_SERVICE"


def compute_solvency_metrics(current: PeriodFinancials) -> list[MetricResult]:
    v = current.values
    ebitda = v.get(EBITDA)
    debt_service = v.get(DEBT_SERVICE)

    dscr = None
    if ebitda is not None and debt_service is not None and debt_service != 0:
        dscr = ebitda / debt_service
    dscr_reason = None if dscr is not None else "EBITDA or debt service (interest + principal due) not available"

    total_debt = v.get(TOTAL_DEBT)
    leverage = None
    if total_debt is not None and ebitda is not None and ebitda != 0:
        leverage = total_debt / ebitda
    leverage_reason = None if leverage is not None else "Total debt or EBITDA not available"

    return [
        MetricResult("dscr", dscr, dscr_reason),
        MetricResult("leverage_ratio", leverage, leverage_reason),
    ]
