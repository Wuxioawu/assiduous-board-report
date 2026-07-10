from app.services.metrics.common import (
    MetricResult,
    PeriodFinancials,
    pct_change,
    period_length_days,
    period_offset_by_days,
    previous_period,
)

REVENUE = "REVENUE"
CUSTOMER_COUNT = "CUSTOMER_COUNT"


def compute_growth_metrics(
    current: PeriodFinancials, history: list[PeriodFinancials]
) -> list[MetricResult]:
    results: list[MetricResult] = []

    revenue = current.values.get(REVENUE)
    results.append(
        MetricResult(
            "revenue",
            revenue,
            None if revenue is not None else "Revenue not extracted",
            missing_taxonomy_codes=None if revenue is not None else [REVENUE],
        )
    )

    prior_year = period_offset_by_days(history, current, target_gap_days=365, gap_tolerance_days=45)
    if prior_year is None:
        results.append(
            MetricResult("revenue_yoy_growth", None, "No prior-year period of comparable length found")
        )
    else:
        growth = pct_change(revenue, prior_year.values.get(REVENUE))
        results.append(
            MetricResult(
                "revenue_yoy_growth",
                growth,
                None if growth is not None else "Revenue not available for the current or prior-year period",
            )
        )

    if period_length_days(current) > 45:
        results.append(
            MetricResult(
                "revenue_mom_growth", None, "MoM growth requires monthly-granularity reporting periods"
            )
        )
    else:
        prior_month = period_offset_by_days(history, current, target_gap_days=30, gap_tolerance_days=10)
        if prior_month is None:
            results.append(MetricResult("revenue_mom_growth", None, "No prior-month period found"))
        else:
            growth = pct_change(revenue, prior_month.values.get(REVENUE))
            results.append(
                MetricResult(
                    "revenue_mom_growth",
                    growth,
                    None
                    if growth is not None
                    else "Revenue not available for the current or prior-month period",
                )
            )

    customer_count = current.values.get(CUSTOMER_COUNT)
    results.append(
        MetricResult(
            "customer_count",
            customer_count,
            None if customer_count is not None else "Customer count not extracted",
            missing_taxonomy_codes=None if customer_count is not None else [CUSTOMER_COUNT],
        )
    )

    prev = previous_period(history, current)
    if prev is None:
        results.append(MetricResult("customer_count_growth", None, "No preceding period available for comparison"))
    else:
        growth = pct_change(customer_count, prev.values.get(CUSTOMER_COUNT))
        results.append(
            MetricResult(
                "customer_count_growth",
                growth,
                None
                if growth is not None
                else "Customer count not available for the current or preceding period",
            )
        )

    return results
