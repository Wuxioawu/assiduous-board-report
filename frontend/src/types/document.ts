export type DocumentStatus = "pending" | "processing" | "extracted" | "failed";

export interface CompanyDocument {
  id: string;
  company_id: string;
  filename: string;
  file_type: string;
  status: DocumentStatus;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}
