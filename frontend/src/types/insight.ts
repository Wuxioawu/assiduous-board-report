export type Audience = "management" | "board" | "equity" | "credit";

export type InsightSeverity = "info" | "warning" | "critical";

export interface Insight {
  id: string;
  company_id: string;
  audience: Audience;
  period_start: string;
  period_end: string;
  insight_type: string;
  title: string;
  body: string;
  severity: InsightSeverity;
  created_at: string;
}
