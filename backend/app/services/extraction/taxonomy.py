import enum
from dataclasses import dataclass


class TaxonomyCategory(str, enum.Enum):
    INCOME_STATEMENT = "income_statement"
    BALANCE_SHEET = "balance_sheet"
    CASH_FLOW = "cash_flow"
    OPERATIONAL = "operational"


class ExpectedUnit(str, enum.Enum):
    CURRENCY = "currency"
    COUNT = "count"
    PERCENTAGE = "percentage"


@dataclass(frozen=True)
class TaxonomyEntry:
    code: str
    display_name: str
    category: TaxonomyCategory
    expected_unit: ExpectedUnit


_ENTRIES = [
    TaxonomyEntry("REVENUE", "Revenue", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY),
    TaxonomyEntry(
        "COST_OF_GOODS_SOLD", "Cost of Goods Sold", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry("GROSS_PROFIT", "Gross Profit", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY),
    TaxonomyEntry(
        "OPERATING_EXPENSES", "Operating Expenses", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry("EBITDA", "EBITDA", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY),
    TaxonomyEntry(
        "OPERATING_INCOME", "Operating Income", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry("NET_INCOME", "Net Income", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY),
    TaxonomyEntry(
        "CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry("TOTAL_DEBT", "Total Debt", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY),
    TaxonomyEntry("TOTAL_ASSETS", "Total Assets", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY),
    TaxonomyEntry("TOTAL_EQUITY", "Total Equity", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY),
    TaxonomyEntry("CURRENT_ASSETS", "Current Assets", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY),
    TaxonomyEntry(
        "CURRENT_LIABILITIES", "Current Liabilities", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry(
        "CAPITAL_EXPENDITURE", "Capital Expenditure", TaxonomyCategory.CASH_FLOW, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry(
        "DEBT_SERVICE",
        "Debt Service (interest + principal due in the period)",
        TaxonomyCategory.CASH_FLOW,
        ExpectedUnit.CURRENCY,
    ),
    TaxonomyEntry("CUSTOMER_COUNT", "Customer Count", TaxonomyCategory.OPERATIONAL, ExpectedUnit.COUNT),
]

TAXONOMY: dict[str, TaxonomyEntry] = {entry.code: entry for entry in _ENTRIES}
