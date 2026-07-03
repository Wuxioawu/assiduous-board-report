/**
 * Shapes mirror the future `metric` table / API response
 * (see ARCHITECTURE.md §2.6) so chart props won't need to change once
 * real data replaces the current placeholder/mock data.
 */

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
