import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { mockMarginBreakdown } from "@/charts/mockData";
import type { MarginBreakdownChartProps } from "@/types/metrics";

export function MarginBreakdownChart({
  companyName,
  data = mockMarginBreakdown,
}: Partial<MarginBreakdownChartProps>) {
  return (
    <div className="h-80 w-full">
      <p className="mb-4 text-base font-semibold text-navy">
        {companyName ?? "Sample Company"} · Margin Breakdown
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
          <XAxis
            dataKey="period_label"
            stroke="var(--axis)"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          />
          <YAxis
            stroke="var(--axis)"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            tickFormatter={(v: number) => `${v}%`}
            width={48}
          />
          <Tooltip
            formatter={(value: number) => `${value.toFixed(1)}%`}
            contentStyle={{
              backgroundColor: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(27, 29, 36, 0.08)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
            cursor={{ fill: "rgba(27, 29, 36, 0.04)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
          <Bar
            dataKey="grossMarginPct"
            name="Gross Margin"
            fill="var(--series-1)"
            radius={[4, 4, 0, 0]}
          />
          <Bar dataKey="netMarginPct" name="Net Margin" fill="var(--series-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
