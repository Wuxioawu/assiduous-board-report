export interface BudgetEntry {
  id: string;
  company_id: string;
  taxonomy_code: string;
  value: number;
  currency: string;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetEntryInput {
  taxonomy_code: string;
  value: number;
  currency: string;
}

export interface BudgetPeriodSummary {
  period_start: string;
  period_end: string;
  entries: BudgetEntry[];
  updated_at: string;
}
