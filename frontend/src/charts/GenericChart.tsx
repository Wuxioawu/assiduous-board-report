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

import { chartPointLabel, formatChartValue } from "@/lib/chartFormat";
import type { ChartConfig } from "@/types/chart";

const SERIES_COLORS = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)",
  "var(--series-4)", "var(--series-5)", "var(--series-6)",
];

const TOOLTIP_STYLE = {
  backgroundColor: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(27, 29, 36, 0.08)",
  color: "var(--text-primary)",
  fontSize: 12,
};

/** Renders a "line", "grouped_bar", or "stacked_bar" ChartConfig (see
 * GET .../charts) - one component for every new audience-specific trend/
 * comparison chart (cost structure, growth vs. target, debt composition,
 * pipeline funnel, cash runway projection) instead of a bespoke component
 * per chart, since they're all fundamentally the same Recharts primitive
 * with different series/stacking. Waterfall ("cash_flow_bridge") and card
 * chart_types are handled elsewhere (CashRunwayChart and GenericChartCard
 * respectively) since their shapes are genuinely different. */
export function GenericChart({ config, currency }: { config: ChartConfig; currency: string }) {
  const categories = config.series[0]?.points.map(chartPointLabel) ?? [];
  const rows = categories.map((category, i) => {
    const row: Record<string, string | number> = { category };
    config.series.forEach((s) => {
      row[s.label] = s.points[i]?.value ?? 0;
    });
    return row;
  });

  const valueFormatter = (value: number) => formatChartValue(value, config.format, currency);
  const isLine = config.chart_type === "line";
  const isStacked = config.chart_type === "stacked_bar";
  const Chart = isLine ? LineChart : BarChart;

  return (
    <div className="h-80 w-full">
      <p className="mb-4 text-base font-semibold text-navy">{config.display_name}</p>
      {config.annotation && <p className="-mt-3 mb-3 text-xs text-muted">{config.annotation}</p>}
      <ResponsiveContainer width="100%" height="90%">
        <Chart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
          <XAxis
            dataKey="category"
            stroke="var(--axis)"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            interval={0}
          />
          <YAxis
            stroke="var(--axis)"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            tickFormatter={valueFormatter}
            width={64}
          />
          <Tooltip formatter={valueFormatter} contentStyle={TOOLTIP_STYLE} />
          {config.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />}
          {config.series.map((s, i) =>
            isLine ? (
              <Line
                key={s.label}
                type="monotone"
                dataKey={s.label}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ) : (
              <Bar
                key={s.label}
                dataKey={s.label}
                fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                radius={isStacked ? undefined : [4, 4, 0, 0]}
                stackId={isStacked ? "stack" : undefined}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
