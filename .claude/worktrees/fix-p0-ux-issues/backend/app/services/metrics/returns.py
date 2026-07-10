from app.services.metrics.common import MetricResult, PeriodFinancials

OPERATING_INCOME = "OPERATING_INCOME"
TOTAL_ASSETS = "TOTAL_ASSETS"
CURRENT_LIABILITIES = "CURRENT_LIABILITIES"


def compute_returns_metrics(current: PeriodFinancials) -> list[MetricResult]:
    v = current.values
    operating_income = v.get(OPERATING_INCOME)
    total_assets = v.get(TOTAL_ASSETS)
    current_liabilities = v.get(CURRENT_LIABILITIES)

    roce = None
    reason = None
    if operating_income is None or total_assets is None or current_liabilities is None:
        reason = "Operating income, total assets, or current liabilities not available"
    else:
        capital_employed = total_assets - current_liabilities
        if capital_employed == 0:
            reason = "Capital employed (total assets - current liabilities) is zero"
        else:
            roce = operating_income / capital_employed * 100

    return [MetricResult("roce", roce, reason)]
