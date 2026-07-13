/**
 * Chart-prop shapes mirror the `metric` table / API response (see
 * ARCHITECTURE.md §2.6). The `MetricValue*` / `Metric*Response` types below
 * are the raw GET .../metrics and .../metrics/history response shapes;
 * adapters in `@/lib/dashboardData` map them onto the chart-prop shapes.
 */

import type { SourceRef } from "@/types/chart";

export interface MetricValue {
  key: string;
  label: string;
  // Null when the metric couldn't be computed for this period (missing
  // underlying financial data) - `reason` explains why (e.g. "TOTAL_DEBT not
  // extracted for this period") rather than the card just showing an
  // unexplained "—".
  value: number | null;
  reason?: string | null;
  // Exact taxonomy code(s) responsible when `reason` traces to specific missing line
  // item(s) (see backend MetricResult.missing_taxonomy_codes) - absent/empty when the
  // metric has a value, or is missing for a non-taxonomy reason (e.g. no prior-year
  // period to compare against). Used to deep-link to a pre-filled "Add Missing Line
  // Item" form (see dashboardData.buildAddMissingLineItemHref).
  missing_taxonomy_codes?: string[] | null;
  // True for a ratio whose inputs are all present but the result isn't
  // meaningful to show as a plain number (e.g. DSCR/leverage divided by a
  // negative EBITDA) - render "n/m" instead of "—", with `reason` still
  // driving the explanatory tooltip. Distinct from value==null (missing
  // data) - here the data is present, the ratio just isn't meaningful.
  not_meaningful?: boolean;
  unit: string;
  // Non-null only when a budget entry exists for this metric's period (see
  // BudgetSettingsView / api/budgets.ts). The backend (Pydantic) always sends
  // these keys, serialized as JSON null rather than omitted, when no budget is
  // set - so `null`, not `undefined`, is the "absent" value here.
  budget_value?: number | null;
  variance?: number | null;
  variance_pct?: number | null;
  higher_is_better?: boolean | null;
  // Non-null only when the company has an industry set and a matching
  // IndustryBenchmark entry exists (see BenchmarkSettingsView / api/benchmarks.ts).
  benchmark_value?: number | null;
  vs_benchmark_pct?: number | null;
  benchmark_source?: string | null;
  benchmark_period_label?: string | null;
}

export interface MetricsResponse {
  company_id: string;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  growth: MetricValue[];
  profitability: MetricValue[];
  cash: MetricValue[];
  solvency: MetricValue[];
  returns: MetricValue[];
}

/** What a single point/statement actually covers - see backend
 * app.models.enums.PeriodType. A trend line must never mix points of
 * different period_types as if they were comparable (a half-year figure next
 * to a full-year one) - see ReportView's period-type filter/toggle. */
export type PeriodType = "FY" | "HY" | "Q";

/** Fields needed to build a fiscal-year-aware period label (see
 * lib/periods.formatPeriodLabel) - shared by every point/entry type below so
 * one formatter works for all of them instead of each chart building its own
 * string. fiscal_year/fiscal_quarter are computed server-side (see backend
 * api/v1/routes/metrics.py) since they require the company's
 * fiscal_year_start_month, which these point-level types don't otherwise
 * carry. */
export interface PeriodLabelFields {
  period_end: string;
  period_type: PeriodType;
  fiscal_year: number;
  /** Only meaningful when period_type is "Q" - the 1-4 quarter index. */
  fiscal_quarter?: number | null;
}

export interface MetricHistoryPoint extends PeriodLabelFields {
  period_start: string;
  value: number;
}

export interface MetricHistoryResponse {
  company_id: string;
  series: Record<string, MetricHistoryPoint[]>;
}

export interface MetricPoint extends PeriodLabelFields {
  period_start: string; // ISO date
  value: number;
}

export interface RevenueTrendSeries {
  label: string;
  points: MetricPoint[];
}

export interface RevenueTrendChartProps {
  companyName: string;
  series: RevenueTrendSeries[];
  currency: string;
}

export interface MarginBreakdownEntry {
  period_label: string;
  grossMarginPct: number;
  netMarginPct: number;
}

export interface MarginBreakdownChartProps {
  companyName: string;
  data: MarginBreakdownEntry[];
}

export interface CashRunwayStep {
  label: string;
  value: number;
  type: "increase" | "decrease" | "total";
}

export interface CashRunwayChartProps {
  companyName: string;
  steps: CashRunwayStep[];
  currency: string;
}

export interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  deltaPct?: number;
  deltaDirectionGoodWhenUp?: boolean;
  budget?: BudgetComparison;
  benchmark?: BenchmarkComparison;
  /** Why `value` is "—" (see metricMissingReason in @/lib/dashboardData).
   * Renders a small hover/tap affordance next to the value; omitted when the
   * metric has a real value. */
  reason?: string;
  /** True for MetricValue.not_meaningful (e.g. DSCR/leverage over a
   * negative EBITDA) - renders the value as "n/m" (see
   * dashboardData.formatMetricValue) instead of "—", and changes the hint
   * popover's wording/links since the data isn't actually missing. */
  notMeaningful?: boolean;
  /** Link to the company's Documents page, shown alongside `reason` since
   * the fix for missing data is almost always "go add the missing line
   * item there". Used as a fallback when `addMissingHref` isn't available. */
  documentsHref?: string;
  /** Link straight to the Documents page's "Add Missing Line Item" form,
   * pre-filled with the taxonomy code and period responsible (see
   * dashboardData.buildAddMissingLineItemHref). Takes precedence over
   * `documentsHref` when both are present. */
  addMissingHref?: string;
  /** Source document excerpt(s) this value was extracted from (see
   * GET .../charts, lib/dashboardData.findRevenueCardSourceRefs) - renders a
   * click/hover affordance revealing them. Only ever shown when `reason` is
   * absent (a missing value has nothing to source). */
  sourceRefs?: SourceRef[];
  /** Free-text caption below the card (e.g. a ChartConfig.annotation like
   * "Target: EBITDA breakeven by FY2028" - see GET .../charts). */
  note?: string;
}

export interface BudgetComparison {
  budgetValue: number;
  variancePct: number | null;
  higherIsBetter: boolean;
  currency: string;
}

export interface BenchmarkComparison {
  benchmarkValue: number;
  vsBenchmarkPct: number | null;
  /** actual - benchmark, in the metric's own unit (percentage points for a
   * margin, x for a ratio) - what "you're 8pts above" is built from. */
  pointDelta: number;
  higherIsBetter: boolean;
  source: string;
  periodLabel: string;
  unit: string;
}
