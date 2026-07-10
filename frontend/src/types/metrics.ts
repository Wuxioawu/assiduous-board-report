/**
 * Chart-prop shapes mirror the `metric` table / API response (see
 * ARCHITECTURE.md §2.6). The `MetricValue*` / `Metric*Response` types below
 * are the raw GET .../metrics and .../metrics/history response shapes;
 * adapters in `@/lib/dashboardData` map them onto the chart-prop shapes.
 */

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

export interface MetricHistoryPoint {
  period_start: string;
  period_end: string;
  value: number;
}

export interface MetricHistoryResponse {
  company_id: string;
  series: Record<string, MetricHistoryPoint[]>;
}

export interface MetricPoint {
  period_start: string; // ISO date
  period_end: string; // ISO date
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
  /** Link to the company's Documents page, shown alongside `reason` since
   * the fix for missing data is almost always "go add the missing line
   * item there". Used as a fallback when `addMissingHref` isn't available. */
  documentsHref?: string;
  /** Link straight to the Documents page's "Add Missing Line Item" form,
   * pre-filled with the taxonomy code and period responsible (see
   * dashboardData.buildAddMissingLineItemHref). Takes precedence over
   * `documentsHref` when both are present. */
  addMissingHref?: string;
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
