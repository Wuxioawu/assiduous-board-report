export type Audience = "management" | "board" | "equity" | "credit";

export type InsightSeverity = "info" | "warning" | "critical";

export type StatTrend = "up" | "down" | "neutral";

export interface KeyStat {
  label: string;
  value: string;
  trend: StatTrend;
  note: string | null;
}

export interface InsightSection {
  label: string;
  summary: string;
  key_stats: KeyStat[];
  detail: string;
}

export interface StructuredInsightContent {
  headline: string;
  sections: InsightSection[];
  watch_items: string[];
}

export interface Insight {
  id: string;
  company_id: string;
  audience: Audience;
  period_start: string;
  period_end: string;
  insight_type: string;
  title: string;
  body: string;
  // Null for insights generated before this field existed - render title/body as
  // a plain paragraph fallback in that case.
  structured_content: StructuredInsightContent | null;
  // Human edit of the content, same shape - present only when is_edited. The AI
  // version above is never overwritten, so it stays available to revert to.
  edited_content: StructuredInsightContent | null;
  is_edited: boolean;
  edited_by_user_id: string | null;
  edited_by_name: string | null;
  edited_at: string | null;
  severity: InsightSeverity;
  created_at: string;
}
