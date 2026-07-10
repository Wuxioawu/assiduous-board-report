/**
 * Chart-prop shapes mirror the `metric` table / API response (see
 * ARCHITECTURE.md §2.6). The `MetricValue*` / `Metric*Response` types below
 * are the raw GET .../metrics and .../metrics/history response shapes;
 * adapters in `@/lib/dashboardData` map them onto the chart-prop shapes.
 */

export interface MetricValue {
  key: string;
  label: string;
  value: number;
  unit: string;
}

export interface MetricsResponse {
  company_id: string;
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
  unit: string;
  points: MetricPoint[];
}

export interface RevenueTrendChartProps {
  companyName: string;
  series: RevenueTrendSeries[];
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
}

export interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  deltaPct?: number;
  deltaDirectionGoodWhenUp?: boolean;
}
