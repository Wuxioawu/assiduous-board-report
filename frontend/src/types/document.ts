export type DocumentStatus = "pending" | "processing" | "extracted" | "failed";

export const IN_PROGRESS_DOCUMENT_STATUSES: DocumentStatus[] = ["pending", "processing"];

export type DocumentSourceType = "manual_upload" | "auto_fetched";

export interface CompanyDocument {
  id: string;
  company_id: string;
  filename: string;
  file_type: string;
  status: DocumentStatus;
  period_start: string | null;
  period_end: string | null;
  error_message: string | null;
  source_type: DocumentSourceType;
  created_at: string;
}
