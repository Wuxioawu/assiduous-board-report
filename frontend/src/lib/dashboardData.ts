import { formatCurrency } from "@/lib/formatCurrency";
import type {
  BenchmarkComparison,
  BudgetComparison,
  CashRunwayStep,
  MarginBreakdownEntry,
  MetricHistoryResponse,
  MetricsResponse,
  MetricValue,
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
  if (!metric || metric.value == null) return "—";
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

function formatPeriodLabel(periodEnd: string): string {
  const d = new Date(periodEnd);
  return `FY${d.getFullYear()}`;
}

export function buildRevenueTrendSeries(history: MetricHistoryResponse | null): RevenueTrendSeries[] {
  const points = history?.series.revenue ?? [];
  if (points.length === 0) return [];
  return [
    {
      label: "Revenue",
      points: points.map((p) => ({
        period_start: p.period_start,
        period_end: p.period_end,
        value: p.value,
      })),
    },
  ];
}

export function buildMarginBreakdown(history: MetricHistoryResponse | null): MarginBreakdownEntry[] {
  const gross = history?.series.gross_margin ?? [];
  const net = history?.series.net_margin ?? [];
  if (gross.length === 0) return [];
  return gross.map((g, i) => ({
    period_label: formatPeriodLabel(g.period_end),
    grossMarginPct: g.value,
    netMarginPct: net[i]?.value ?? 0,
  }));
}

/** EBITDA -> Free Cash Flow bridge for the current period, built from the
 * taxonomy fields we actually extract (EBITDA, CapEx, FCF) rather than
 * fabricating a beginning/ending cash waterfall we have no data for. */
export function buildEbitdaToFcfBridge(metrics: MetricsResponse | null): CashRunwayStep[] {
  const ebitda = findMetric(metrics?.profitability, "ebitda");
  const capex = findMetric(metrics?.cash, "capital_expenditure");
  const fcf = findMetric(metrics?.cash, "free_cash_flow");
  if (ebitda?.value == null || capex?.value == null || fcf?.value == null) return [];
  return [
    { label: "EBITDA", value: ebitda.value, type: "total" },
    { label: "Capital Expenditure", value: -Math.abs(capex.value), type: "decrease" },
    { label: "Free Cash Flow", value: fcf.value, type: "total" },
  ];
}
