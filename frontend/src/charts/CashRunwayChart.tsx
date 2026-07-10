import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { mockCashRunwaySteps } from "@/charts/mockData";
import { formatCurrency } from "@/lib/formatCurrency";
import type { CashRunwayChartProps, CashRunwayStep } from "@/types/metrics";

// Migrated from Plotly's native waterfall chart type to a stacked Recharts bar
// (invisible "base" segment + visible "delta" segment per bar) so every chart
// in the app shares one library - same interaction/tooltip feel, one fewer
// heavy dependency, and (unlike Plotly, which needed concrete hex values) can
// reference the app's CSS custom properties directly.
const COLORS = {
  increase: "var(--status-good)",
  decrease: "var(--status-critical)",
  total: "var(--series-2)",
};

interface BridgeRow {
  label: string;
  base: number;
  delta: number;
  displayValue: number;
  color: string;
}

function buildBridgeRows(steps: CashRunwayStep[]): BridgeRow[] {
  let cumulative = 0;
  return steps.map((step) => {
    if (step.type === "total") {
      cumulative = step.value;
      return { label: step.label, base: 0, delta: step.value, displayValue: step.value, color: COLORS.total };
    }
    const start = cumulative;
    cumulative += step.value;
    return {
      label: step.label,
      base: Math.min(start, cumulative),
      delta: Math.abs(step.value),
      displayValue: step.value,
      color: step.type === "increase" ? COLORS.increase : COLORS.decrease,
    };
  });
}

type CashRunwayChartRenderProps = Partial<Omit<CashRunwayChartProps, "currency">> &
  Pick<CashRunwayChartProps, "currency">;

export function CashRunwayChart({
  companyName,
  steps = mockCashRunwaySteps,
  currency,
}: CashRunwayChartRenderProps) {
  const rows = buildBridgeRows(steps);

  return (
    <div className="h-80 w-full">
      <p className="mb-4 text-base font-semibold text-navy">
        {companyName ?? "Sample Company"} · Cash Flow Bridge
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={rows} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--gridline)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--axis)" tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
          <YAxis
            stroke="var(--axis)"
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            tickFormatter={(value: number) => formatCurrency(value, currency)}
            width={64}
          />
          <Tooltip
            formatter={(_value: number, _name: string, entry: { payload?: BridgeRow }) =>
              [formatCurrency(entry.payload?.displayValue ?? 0, currency), "Value"] as [string, string]
            }
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
          {/* Invisible spacer so the visible "delta" segment floats at the
           * right height - the classic stacked-bar technique for building a
           * waterfall chart without a dedicated chart type. */}
          <Bar dataKey="base" stackId="bridge" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="delta" stackId="bridge" isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.label} fill={row.color} />
            ))}
            <LabelList
              dataKey="displayValue"
              position="top"
              formatter={(value: number) => formatCurrency(value, currency)}
              style={{ fill: "var(--text-muted)", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
