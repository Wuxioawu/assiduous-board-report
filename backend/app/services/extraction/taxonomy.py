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
    # Subject to ValidationService's revenue-scale sanity check (see
    # services/validation/service.py) - flags a value that's wildly outside a
    # plausible range for this company's size (e.g. a unit-conversion error
    # slipping through, "354813" extracted as "354813000") as needs_review
    # rather than trusting it silently.
    revenue_scale_check: bool = False


_ENTRIES = [
    TaxonomyEntry(
        "REVENUE", "Revenue", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY, revenue_scale_check=True
    ),
    TaxonomyEntry(
        "COST_OF_GOODS_SOLD", "Cost of Goods Sold", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry("GROSS_PROFIT", "Gross Profit", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY),
    TaxonomyEntry(
        "OPERATING_EXPENSES", "Operating Expenses", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY
    ),
    # Rarely disclosed as its own headline figure and unreliable when it is
    # (see services/metrics/profitability.py) - EBITDA is computed from
    # OPERATING_INCOME + DEPRECIATION instead, but this stays in the taxonomy
    # as a fallback for the rare filing that does state it directly with
    # nothing else to derive it from.
    TaxonomyEntry("EBITDA", "EBITDA", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY),
    TaxonomyEntry(
        "OPERATING_INCOME", "Operating Income", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY
    ),
    # Usually only visible in the cash flow statement's reconciliation of loss
    # to operating cash flow (e.g. "Depreciation 10,014"), not broken out as
    # its own P&L line - see services/metrics/profitability.py, which adds
    # this back to OPERATING_INCOME to compute EBITDA.
    TaxonomyEntry(
        "DEPRECIATION", "Depreciation and Amortization", TaxonomyCategory.CASH_FLOW, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry("NET_INCOME", "Net Income", TaxonomyCategory.INCOME_STATEMENT, ExpectedUnit.CURRENCY),
    TaxonomyEntry(
        "CASH_AND_EQUIVALENTS", "Cash and Cash Equivalents", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY
    ),
    # Interest-bearing borrowings only (e.g. "Creditors: amounts falling due
    # after more than one year" when that line is bank/loan debt) - NOT
    # CURRENT_LIABILITIES (due within a year, mostly trade creditors) and NOT
    # CONTINGENT_CONSIDERATION (an M&A earn-out, not a loan).
    TaxonomyEntry("TOTAL_DEBT", "Total Debt (interest-bearing borrowings)", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY),
    TaxonomyEntry("TOTAL_ASSETS", "Total Assets", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY),
    TaxonomyEntry("TOTAL_EQUITY", "Total Equity", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY),
    # Balance sheet's own "Net Assets" subtotal (Total Assets - Total
    # Liabilities), stated independently of TOTAL_EQUITY in most statutory
    # accounts (e.g. as a line above the "Capital and Reserves" section) even
    # though the two should always agree by accounting definition - extracting
    # both, rather than deriving one from the other, is what lets
    # ValidationService's net_assets == total_equity check actually catch a
    # real extraction error instead of just checking a tautology.
    TaxonomyEntry("NET_ASSETS", "Net Assets", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY),
    # A contingent liability (e.g. an M&A earn-out payable only if performance
    # targets are met) - not a current liability in the ordinary sense, but
    # material enough that credit analysis wants to see current ratio both
    # with and without it (see services/charts/registry.py's dual
    # current_ratio cards). Extract as a positive magnitude even if the
    # source shows it as a negative deduction (same convention as
    # CAPITAL_EXPENDITURE - see the sign-convention rule below).
    TaxonomyEntry(
        "CONTINGENT_CONSIDERATION", "Contingent Consideration", TaxonomyCategory.BALANCE_SHEET, ExpectedUnit.CURRENCY
    ),
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
    # Cash flow statement's own six headline figures - extracted directly (not
    # derived) so the Cash Flow Bridge waterfall and ValidationService's
    # cash-bridge identity check are both built from what the document
    # actually states, not a figure computed some other way and assumed
    # correct. CASH_CLOSING is deliberately a SEPARATE code from
    # CASH_AND_EQUIVALENTS even though they should agree: the cash flow
    # statement's own "cash at end of period" line and the balance sheet's
    # "cash and cash equivalents" line are two independently-stated figures in
    # the source document - see ValidationService's
    # cash_flow_closing_cash == balance_sheet_cash check, which needs them to
    # stay two separate fields to be a meaningful cross-check rather than
    # comparing a number to itself.
    TaxonomyEntry(
        "CASH_OPENING", "Cash and Cash Equivalents at Beginning of Period", TaxonomyCategory.CASH_FLOW, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry(
        "NET_OPERATING_CASH_FLOW", "Net Cash from Operating Activities", TaxonomyCategory.CASH_FLOW, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry(
        "NET_INVESTING_CASH_FLOW", "Net Cash from Investing Activities", TaxonomyCategory.CASH_FLOW, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry(
        "NET_FINANCING_CASH_FLOW", "Net Cash from Financing Activities", TaxonomyCategory.CASH_FLOW, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry(
        "CASH_CLOSING", "Cash and Cash Equivalents at End of Period", TaxonomyCategory.CASH_FLOW, ExpectedUnit.CURRENCY
    ),
    # The cash flow statement's "Issue of new shares" financing-activities
    # sub-line (a component already summed into NET_FINANCING_CASH_FLOW) -
    # extracted separately since equity investors specifically want to see
    # new capital raised on its own, not blended with loan draws/repayments.
    TaxonomyEntry(
        "NEW_EQUITY_RAISED", "New Equity Raised (Issue of New Shares)", TaxonomyCategory.CASH_FLOW, ExpectedUnit.CURRENCY
    ),
    TaxonomyEntry("CUSTOMER_COUNT", "Customer Count", TaxonomyCategory.OPERATIONAL, ExpectedUnit.COUNT),
    # Total issued share count, typically disclosed in a "Listing Statistics"
    # or similar box near the front of a filing (e.g. "Issued Share Capital:
    # 2,561,332"), not inside the main financial statement tables.
    TaxonomyEntry("SHARES_OUTSTANDING", "Shares Outstanding", TaxonomyCategory.OPERATIONAL, ExpectedUnit.COUNT),
]

TAXONOMY: dict[str, TaxonomyEntry] = {entry.code: entry for entry in _ENTRIES}
