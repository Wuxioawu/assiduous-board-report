// Mirrors backend/app/services/extraction/taxonomy.py's TAXONOMY - kept in sync by hand
// since the codes/labels shown here are purely presentational (the backend independently
// validates any taxonomy_code it's sent, so a drift here fails safely as a 400).
export interface TaxonomyEntry {
  code: string;
  label: string;
}

export const TAXONOMY_ENTRIES: TaxonomyEntry[] = [
  { code: "REVENUE", label: "Revenue" },
  { code: "COST_OF_GOODS_SOLD", label: "Cost of Goods Sold" },
  { code: "GROSS_PROFIT", label: "Gross Profit" },
  { code: "OPERATING_EXPENSES", label: "Operating Expenses" },
  { code: "EBITDA", label: "EBITDA" },
  { code: "OPERATING_INCOME", label: "Operating Income" },
  { code: "DEPRECIATION", label: "Depreciation and Amortization" },
  { code: "NET_INCOME", label: "Net Income" },
  { code: "CASH_AND_EQUIVALENTS", label: "Cash and Cash Equivalents" },
  { code: "TOTAL_DEBT", label: "Total Debt (interest-bearing borrowings)" },
  { code: "TOTAL_ASSETS", label: "Total Assets" },
  { code: "TOTAL_EQUITY", label: "Total Equity" },
  { code: "NET_ASSETS", label: "Net Assets" },
  { code: "CONTINGENT_CONSIDERATION", label: "Contingent Consideration" },
  { code: "CURRENT_ASSETS", label: "Current Assets" },
  { code: "CURRENT_LIABILITIES", label: "Current Liabilities" },
  { code: "CAPITAL_EXPENDITURE", label: "Capital Expenditure" },
  { code: "DEBT_SERVICE", label: "Debt Service (interest + principal due in the period)" },
  { code: "CASH_OPENING", label: "Cash and Cash Equivalents at Beginning of Period" },
  { code: "NET_OPERATING_CASH_FLOW", label: "Net Cash from Operating Activities" },
  { code: "NET_INVESTING_CASH_FLOW", label: "Net Cash from Investing Activities" },
  { code: "NET_FINANCING_CASH_FLOW", label: "Net Cash from Financing Activities" },
  { code: "CASH_CLOSING", label: "Cash and Cash Equivalents at End of Period" },
  { code: "NEW_EQUITY_RAISED", label: "New Equity Raised (Issue of New Shares)" },
  { code: "CUSTOMER_COUNT", label: "Customer Count" },
  { code: "SHARES_OUTSTANDING", label: "Shares Outstanding" },
];

export const TAXONOMY_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  TAXONOMY_ENTRIES.map((entry) => [entry.code, entry.label]),
);
