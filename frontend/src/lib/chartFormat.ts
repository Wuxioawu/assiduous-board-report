import { formatCurrency } from "@/lib/formatCurrency";
import { formatPeriodLabel } from "@/lib/periods";
import type { ChartFormat, ChartPointData } from "@/types/chart";

/** The single place a ChartConfig's `format` field turns into display text -
 * every new card/chart added for the four audience tabs goes through this
 * rather than each component inventing its own number formatting. */
export function formatChartValue(value: number, format: ChartFormat, currency: string): string {
  switch (format) {
    case "currency":
      return formatCurrency(value, currency);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "count":
      return new Intl.NumberFormat("en-US").format(Math.round(value));
    case "months":
      // Matches dashboardData.formatMetricValue's own "months" unit handling
      // (one decimal, capped display for an unrealistically long runway).
      return value > 120 ? "120+ months" : `${value.toFixed(1)} months`;
  }
}

/** x-axis / bar category label for a chart point - a waterfall/milestone/
 * projection step's own step_label when present (these aren't period-scoped
 * at all), otherwise the period-aware label every period-scoped chart uses
 * (see formatPeriodLabel) so no chart invents its own period text. */
export function chartPointLabel(point: ChartPointData): string {
  if (point.step_label) return point.step_label;
  if (point.period_type && point.period_end && point.fiscal_year != null) {
    return formatPeriodLabel({
      period_end: point.period_end,
      period_type: point.period_type,
      fiscal_year: point.fiscal_year,
      fiscal_quarter: point.fiscal_quarter,
    });
  }
  return "";
}

/** A "line" chart with fewer than this many points reads as a trend, but a
 * trend needs at least 3 points to show a trajectory - two points is just a
 * single change, better shown as a plain bar comparison. Mirrors the
 * backend's own _MIN_POINTS_FOR_LINE_CHART (see api/v1/routes/charts.py) -
 * that constant degrades chart_type server-side for every GET .../charts
 * entry; this one covers the one remaining time-series chart that predates
 * that endpoint and still renders client-side from /metrics/history
 * (RevenueTrendChart) rather than duplicating the check ad hoc there. */
export function shouldRenderAsBarChart(pointCount: number): boolean {
  return pointCount < 3;
}
