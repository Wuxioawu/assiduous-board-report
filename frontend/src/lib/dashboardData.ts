import type {
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

export function formatMetricValue(metric: MetricValue | undefined): string {
  if (!metric) return "—";
  switch (metric.unit) {
    case "currency":
      return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
        metric.value,
      );
    case "percentage":
    case "ratio":
      return metric.value.toFixed(1);
    case "months":
      return metric.value > 120 ? "120+" : metric.value.toFixed(1);
    default:
      return new Intl.NumberFormat("en-US").format(metric.value);
  }
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
      unit: "USD",
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
  if (!ebitda || !capex || !fcf) return [];
  return [
    { label: "EBITDA", value: ebitda.value, type: "total" },
    { label: "Capital Expenditure", value: -Math.abs(capex.value), type: "decrease" },
    { label: "Free Cash Flow", value: fcf.value, type: "total" },
  ];
}
