import enum
from dataclasses import dataclass


class MetricCategory(str, enum.Enum):
    GROWTH = "growth"
    PROFITABILITY = "profitability"
    CASH = "cash"
    SOLVENCY = "solvency"
    RETURNS = "returns"


class MetricUnit(str, enum.Enum):
    CURRENCY = "currency"
    PERCENTAGE = "percentage"
    RATIO = "ratio"
    MONTHS = "months"
    COUNT = "count"


@dataclass(frozen=True)
class MetricDefinition:
    key: str
    label: str
    category: MetricCategory
    unit: MetricUnit
    # Taxonomy code this metric passes through 1:1 from FinancialStatement, if any -
    # only such metrics can be compared against a user-set Budget entry (see
    # api/v1/routes/metrics.py). Derived ratios (margins, growth %, ratios) have no
    # single taxonomy figure to budget against, so they stay None.
    budget_taxonomy_code: str | None = None
    # Whether a higher value is the favorable direction (revenue, profit) vs lower
    # being favorable (costs). Only meaningful for budget-comparable metrics.
    higher_is_better: bool = True


_DEFINITIONS = [
    # Growth
    MetricDefinition("revenue", "Revenue", MetricCategory.GROWTH, MetricUnit.CURRENCY, budget_taxonomy_code="REVENUE"),
    MetricDefinition("revenue_yoy_growth", "Revenue YoY Growth", MetricCategory.GROWTH, MetricUnit.PERCENTAGE),
    MetricDefinition("revenue_mom_growth", "Revenue MoM Growth", MetricCategory.GROWTH, MetricUnit.PERCENTAGE),
    MetricDefinition("customer_count", "Customer Count", MetricCategory.GROWTH, MetricUnit.COUNT),
    MetricDefinition(
        "customer_count_growth", "Customer Count Growth", MetricCategory.GROWTH, MetricUnit.PERCENTAGE
    ),
    # Profitability
    MetricDefinition("gross_margin", "Gross Margin", MetricCategory.PROFITABILITY, MetricUnit.PERCENTAGE),
    MetricDefinition("operating_margin", "Operating Margin", MetricCategory.PROFITABILITY, MetricUnit.PERCENTAGE),
    MetricDefinition("ebitda_margin", "EBITDA Margin", MetricCategory.PROFITABILITY, MetricUnit.PERCENTAGE),
    MetricDefinition("net_margin", "Net Margin", MetricCategory.PROFITABILITY, MetricUnit.PERCENTAGE),
    MetricDefinition(
        "ebitda", "EBITDA", MetricCategory.PROFITABILITY, MetricUnit.CURRENCY, budget_taxonomy_code="EBITDA"
    ),
    MetricDefinition(
        "net_income",
        "Net Income",
        MetricCategory.PROFITABILITY,
        MetricUnit.CURRENCY,
        budget_taxonomy_code="NET_INCOME",
    ),
    MetricDefinition(
        "operating_expenses",
        "Operating Expenses",
        MetricCategory.PROFITABILITY,
        MetricUnit.CURRENCY,
        budget_taxonomy_code="OPERATING_EXPENSES",
        higher_is_better=False,
    ),
    MetricDefinition(
        "cogs_pct_of_revenue", "Cost of Goods Sold (% of Revenue)", MetricCategory.PROFITABILITY, MetricUnit.PERCENTAGE
    ),
    MetricDefinition(
        "opex_pct_of_revenue",
        "Operating Expenses (% of Revenue)",
        MetricCategory.PROFITABILITY,
        MetricUnit.PERCENTAGE,
    ),
    # Cash
    MetricDefinition("cash_balance", "Cash and Cash Equivalents", MetricCategory.CASH, MetricUnit.CURRENCY),
    MetricDefinition("capital_expenditure", "Capital Expenditure", MetricCategory.CASH, MetricUnit.CURRENCY),
    MetricDefinition(
        "free_cash_flow", "Free Cash Flow (EBITDA − CapEx)", MetricCategory.CASH, MetricUnit.CURRENCY
    ),
    MetricDefinition("cash_runway_months", "Cash Runway", MetricCategory.CASH, MetricUnit.MONTHS),
    MetricDefinition("working_capital", "Working Capital", MetricCategory.CASH, MetricUnit.CURRENCY),
    # Solvency
    MetricDefinition("dscr", "Debt Service Coverage Ratio", MetricCategory.SOLVENCY, MetricUnit.RATIO),
    MetricDefinition(
        "leverage_ratio", "Leverage Ratio (Total Debt / EBITDA)", MetricCategory.SOLVENCY, MetricUnit.RATIO
    ),
    # Returns
    MetricDefinition("roce", "Return on Capital Employed", MetricCategory.RETURNS, MetricUnit.PERCENTAGE),
]

METRIC_REGISTRY: dict[str, MetricDefinition] = {d.key: d for d in _DEFINITIONS}
