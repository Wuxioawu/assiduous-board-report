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
