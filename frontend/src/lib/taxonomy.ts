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
  { code: "NET_INCOME", label: "Net Income" },
  { code: "CASH_AND_EQUIVALENTS", label: "Cash and Cash Equivalents" },
  { code: "TOTAL_DEBT", label: "Total Debt" },
  { code: "TOTAL_ASSETS", label: "Total Assets" },
  { code: "TOTAL_EQUITY", label: "Total Equity" },
  { code: "CURRENT_ASSETS", label: "Current Assets" },
  { code: "CURRENT_LIABILITIES", label: "Current Liabilities" },
  { code: "CAPITAL_EXPENDITURE", label: "Capital Expenditure" },
  { code: "DEBT_SERVICE", label: "Debt Service (interest + principal due in the period)" },
  { code: "CUSTOMER_COUNT", label: "Customer Count" },
];

export const TAXONOMY_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  TAXONOMY_ENTRIES.map((entry) => [entry.code, entry.label]),
);
