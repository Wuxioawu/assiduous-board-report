import { formatCurrency } from "@/lib/formatCurrency";
import { formatPeriodLabel, periodKeyOf } from "@/lib/periods";
import type { ChartConfig, SourceRef } from "@/types/chart";
import type {
  BenchmarkComparison,
  BudgetComparison,
  CashRunwayStep,
  MarginBreakdownEntry,
  MetricHistoryPoint,
  MetricHistoryResponse,
  MetricValue,
  PeriodType,
  RevenueTrendSeries,
} from "@/types/metrics";

export function findMetric(values: MetricValue[] | undefined, key: string): MetricValue | undefined {
  return values?.find((v) => v.key === key);
}

/** Maps a metric's budget_value/variance fields (absent for companies/periods
 * with no budget set, or when the metric itself couldn't be computed) onto
 * the MetricCard budget-comparison prop shape. */
export function buildBudgetComparison(
  metric: MetricValue | undefined,
  currency: string,
): BudgetComparison | undefined {
  if (!metric || metric.value == null || metric.budget_value == null) return undefined;
  return {
    budgetValue: metric.budget_value,
    variancePct: metric.variance_pct ?? null,
    higherIsBetter: metric.higher_is_better ?? true,
    currency,
  };
}

/** Maps a metric's benchmark_value/vs_benchmark_pct fields (absent unless the
 * company's industry has a matching IndustryBenchmark entry, or when the
 * metric itself couldn't be computed) onto the MetricCard
 * benchmark-comparison prop shape. */
export function buildBenchmarkComparison(metric: MetricValue | undefined): BenchmarkComparison | undefined {
  if (!metric || metric.value == null || metric.benchmark_value == null) return undefined;
  return {
    benchmarkValue: metric.benchmark_value,
    vsBenchmarkPct: metric.vs_benchmark_pct ?? null,
    pointDelta: metric.value - metric.benchmark_value,
    higherIsBetter: metric.higher_is_better ?? true,
    source: metric.benchmark_source ?? "",
    periodLabel: metric.benchmark_period_label ?? "",
    unit: metric.unit,
  };
}

export function formatMetricValue(metric: MetricValue | undefined, currency: string): string {
  if (!metric || metric.value == null) return metric?.not_meaningful ? "n/m" : "—";
  switch (metric.unit) {
    case "currency":
      return formatCurrency(metric.value, currency);
    case "percentage":
    case "ratio":
      return metric.value.toFixed(1);
    case "months":
      return metric.value > 120 ? "120+" : metric.value.toFixed(1);
    default:
      return new Intl.NumberFormat("en-US").format(metric.value);
  }
}

/** The reason a metric's value is missing (see backend MetricResult.reason),
 * or undefined when the metric has a value (nothing to explain). Always
 * returns a string when the value is missing - including when the metric key
 * is entirely absent from the response, or the backend omitted a reason -
 * rather than sometimes leaving the "—" with no explanation at all
 * (previously the only unexplained case in the app's missing-data handling). */
export function metricMissingReason(metric: MetricValue | undefined): string | undefined {
  if (!metric) return "not available for this metric";
  if (metric.value == null) return metric.reason ?? "no data available";
  return undefined;
}

/** Link straight to the Documents page's "Add Missing Line Item" form, pre-filled with
 * the taxonomy code and period responsible for this metric being missing (see backend
 * MetricResult.missing_taxonomy_codes) - undefined when the metric has a value, or when
 * it's missing for a reason that isn't a specific taxonomy code (e.g. no prior-year
 * period to compare against), in which case MissingDataHint falls back to a plain link
 * to the Documents page. */
export function buildAddMissingLineItemHref(
  companyId: string | undefined,
  metric: MetricValue | undefined,
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
): string | undefined {
  if (!companyId || !periodStart || !periodEnd) return undefined;
  if (!metric || metric.value != null) return undefined;
  const codes = metric.missing_taxonomy_codes;
  if (!codes || codes.length === 0) return undefined;
  const params = new URLSearchParams({
    addTaxonomyCode: codes[0],
    addPeriodStart: periodStart,
    addPeriodEnd: periodEnd,
  });
  return `/companies/${companyId}/documents/financial-data?${params.toString()}`;
}

export function metricUnitLabel(metric: MetricValue | undefined): string | undefined {
  if (!metric) return undefined;
  switch (metric.unit) {
    case "percentage":
      return "%";
    case "ratio":
      return "x";
    case "months":
      return "mo";
    default:
      return undefined;
  }
}

/** The period_type of a series' most recent point (by period_end), used as
 * the Revenue Trend/Margin Breakdown period-type filter's default (see
 * ReportView) - showing whatever the company most recently reported, rather
 * than an arbitrary fixed type that might not exist for this company at all. */
export function mostRecentPeriodType(history: MetricHistoryResponse | null, key: string): PeriodType | null {
  const points = history?.series[key] ?? [];
  if (points.length === 0) return null;
  return points.reduce((latest, p) => (p.period_end > latest.period_end ? p : latest)).period_type;
}

/** Every distinct period_type present across a series - used to decide whether
 * ReportView's period-type toggle needs to be shown at all (a company that has
 * only ever reported one period_type has nothing to switch between). */
export function periodTypesPresent(history: MetricHistoryResponse | null, key: string): PeriodType[] {
  const points = history?.series[key] ?? [];
  return [...new Set(points.map((p) => p.period_type))];
}

function byPeriodType(points: MetricHistoryPoint[], periodType: PeriodType | null): MetricHistoryPoint[] {
  return periodType == null ? points : points.filter((p) => p.period_type === periodType);
}

/** periodType=null plots every period_type in the series together - callers
 * (ReportView) should always pass a specific type in practice, since mixing
 * types on one trend line plots a full-year figure next to a half-year one as
 * if they were comparable. See mostRecentPeriodType for a sensible default. */
export function buildRevenueTrendSeries(
  history: MetricHistoryResponse | null,
  periodType: PeriodType | null,
): RevenueTrendSeries[] {
  const points = byPeriodType(history?.series.revenue ?? [], periodType);
  if (points.length === 0) return [];
  return [{ label: "Revenue", points }];
}

export function buildMarginBreakdown(
  history: MetricHistoryResponse | null,
  periodType: PeriodType | null,
): MarginBreakdownEntry[] {
  const gross = byPeriodType(history?.series.gross_margin ?? [], periodType);
  // Joined by period key (not array index) so a gap in one series - or the
  // periodType filter above removing different points from each - can never
  // pair a gross-margin point with the wrong period's net-margin value.
  const netByPeriod = new Map((history?.series.net_margin ?? []).map((p) => [periodKeyOf(p), p]));
  if (gross.length === 0) return [];
  return gross.map((g) => ({
    period_label: formatPeriodLabel(g),
    grossMarginPct: g.value,
    netMarginPct: netByPeriod.get(periodKeyOf(g))?.value ?? 0,
  }));
}

export function findChart(charts: ChartConfig[] | null, id: string): ChartConfig | undefined {
  return charts?.find((c) => c.id === id);
}

/** True five-step cash flow waterfall (Opening -> Operating -> Investing ->
 * Financing -> Closing), computed server-side from the company's own
 * confirmed CASH_OPENING/NET_OPERATING_CASH_FLOW/NET_INVESTING_CASH_FLOW/
 * NET_FINANCING_CASH_FLOW/CASH_CLOSING statements (see GET .../charts and
 * services/charts/registry.build_cash_flow_bridge) - replaces the old
 * EBITDA->CapEx->FCF approximation, which wasn't a real cash bridge and had
 * no way to show provenance for its numbers. Empty when the company's most
 * recent period doesn't have all five fields confirmed (see the backend
 * builder's docstring for why a partial bridge isn't shown at all). */
export function buildCashFlowBridgeSteps(charts: ChartConfig[] | null): CashRunwayStep[] {
  const chart = findChart(charts, "cash_flow_bridge");
  const points = chart?.series[0]?.points ?? [];
  return points.map((p, i) => {
    const isEndpoint = i === 0 || i === points.length - 1;
    return {
      label: p.step_label ?? "",
      value: p.value,
      type: isEndpoint ? "total" : p.value >= 0 ? "increase" : "decrease",
    };
  });
}

/** Source excerpt(s) backing the Revenue metric card's current value, for the
 * click-to-reveal-provenance affordance on MetricCard (see
 * charts/MetricCard.tsx's sourceRefs prop) - reads the "revenue_card" chart's
 * single point rather than duplicating the lookup logic that
 * services/charts/registry.build_revenue_card already does server-side. */
export function findRevenueCardSourceRefs(charts: ChartConfig[] | null): SourceRef[] | undefined {
  const chart = findChart(charts, "revenue_card");
  const refs = chart?.series[0]?.points[0]?.source_refs;
  return refs && refs.length > 0 ? refs : undefined;
}
