import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { mockRevenueTrendSeries } from "@/charts/mockData";
import { shouldRenderAsBarChart } from "@/lib/chartFormat";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatPeriodLabel } from "@/lib/periods";
import type { RevenueTrendChartProps } from "@/types/metrics";

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

type RevenueTrendChartRenderProps = Partial<Omit<RevenueTrendChartProps, "currency">> &
  Pick<RevenueTrendChartProps, "currency">;

export function RevenueTrendChart({
  companyName,
  series = mockRevenueTrendSeries,
  currency,
}: RevenueTrendChartRenderProps) {
  const periods = series[0]?.points.map((p) => formatPeriodLabel(p)) ?? [];
  const rows = periods.map((period, i) => {
    const row: Record<string, string | number> = { period };
    series.forEach((s) => {
      row[s.label] = s.points[i]?.value ?? 0;
    });
    return row;
  });
  // See shouldRenderAsBarChart - fewer than 3 points reads as a single
  // change, not a trend, so it renders as a plain bar comparison instead of
  // a line (mirrors GET .../charts's own server-side degradation rule).
  const asBarChart = shouldRenderAsBarChart(periods.length);
  const Chart = asBarChart ? BarChart : LineChart;

  return (
    <div className="h-80 w-full">
      <p className="mb-4 text-base font-semibold text-navy">
        {companyName ?? "Sample Company"} · Revenue Trend
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <Chart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
          {/* interval={0}: period labels are now full fiscal labels (e.g.
           * "HY2026 (6M to Dec 2025)"), much longer than the old bare
           * "2025 Q4" - Recharts' default tick-skipping to avoid overlap
           * would otherwise silently drop a tick's text on a chart with only
           * a handful of points, which reads as a missing data point rather
           * than a rendering choice. Showing every tick and letting long
           * labels wrap/truncate visually is preferable to hiding one. */}
          <XAxis
            dataKey="period"
            stroke="var(--axis)"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            interval={0}
          />
          <YAxis
            stroke="var(--axis)"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            tickFormatter={(value: number) => formatCurrency(value, currency)}
            width={64}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value, currency)}
            contentStyle={{
              backgroundColor: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(27, 29, 36, 0.08)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
          {series.map((s, i) =>
            asBarChart ? (
              <Bar key={s.label} dataKey={s.label} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[4, 4, 0, 0]} />
            ) : (
              <Line
                key={s.label}
                type="monotone"
                dataKey={s.label}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
