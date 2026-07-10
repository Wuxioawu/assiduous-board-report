import {
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
import { formatCurrency } from "@/lib/formatCurrency";
import type { RevenueTrendChartProps } from "@/types/metrics";

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

function formatPeriod(periodEnd: string): string {
  const date = new Date(periodEnd);
  return `${date.getFullYear()} Q${Math.floor(date.getMonth() / 3) + 1}`;
}

type RevenueTrendChartRenderProps = Partial<Omit<RevenueTrendChartProps, "currency">> &
  Pick<RevenueTrendChartProps, "currency">;

export function RevenueTrendChart({
  companyName,
  series = mockRevenueTrendSeries,
  currency,
}: RevenueTrendChartRenderProps) {
  const periods = series[0]?.points.map((p) => formatPeriod(p.period_end)) ?? [];
  const rows = periods.map((period, i) => {
    const row: Record<string, string | number> = { period };
    series.forEach((s) => {
      row[s.label] = s.points[i]?.value ?? 0;
    });
    return row;
  });

  return (
    <div className="h-80 w-full">
      <p className="mb-4 text-base font-semibold text-navy">
        {companyName ?? "Sample Company"} · Revenue Trend
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="period" stroke="var(--axis)" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
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
          {series.map((s, i) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
