export interface FinancialStatement {
  id: string;
  company_id: string;
  document_id: string | null;
  taxonomy_code: string;
  value: number;
  currency: string;
  period_start: string;
  period_end: string;
  confidence_score: number | null;
  source_excerpt: string | null;
  source_page: number | null;
  extracted_by: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialStatementHistoryEntry {
  id: string;
  previous_value: number;
  new_value: number;
  changed_by_user_id: string | null;
  changed_at: string;
}

export interface FinancialStatementCreatePayload {
  taxonomy_code: string;
  value: number;
  currency: string;
  period_start: string;
  period_end: string;
  source_note?: string | null;
}
