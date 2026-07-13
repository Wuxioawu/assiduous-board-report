import type { PeriodType } from "@/types/metrics";

/** Mirrors backend app/schemas/chart.py - the GET /companies/{id}/charts response
 * shape. Every chart on the report (Revenue Trend, Margin Breakdown, Cash Flow
 * Bridge) and the Revenue metric card's provenance popover are built from this,
 * not from bespoke per-chart API calls - see lib/dashboardData's chart adapters. */
export interface SourceRef {
  statement_id: string;
  taxonomy_code: string;
  source_excerpt: string | null;
  source_page: number | null;
}

export interface ChartPointData {
  period_start: string | null;
  period_end: string | null;
  period_type: PeriodType | null;
  fiscal_year: number | null;
  fiscal_quarter: number | null;
  step_label: string | null;
  // One-line free text for a "milestone" point (e.g. the source excerpt
  // describing the event) - unused by other chart_types.
  description: string | null;
  value: number;
  source_refs: SourceRef[];
}

export interface ChartSeriesData {
  label: string;
  points: ChartPointData[];
}

export type ChartType = "line" | "grouped_bar" | "stacked_bar" | "waterfall" | "card" | "milestone";
export type ChartFormat = "currency" | "percent" | "ratio" | "count" | "months";

export interface ChartConfig {
  id: string;
  display_name: string;
  chart_type: ChartType;
  audiences: string[];
  format: ChartFormat;
  // Free-text note rendered alongside the chart/card (e.g. ebitda_margin's
  // "Target: EBITDA breakeven by FY2028" annotation) - null when there isn't one.
  annotation: string | null;
  series: ChartSeriesData[];
}
