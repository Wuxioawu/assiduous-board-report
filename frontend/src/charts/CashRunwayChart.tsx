import { useMemo } from "react";
import Plot from "react-plotly.js";

import { mockCashRunwaySteps } from "@/charts/mockData";
import type { CashRunwayChartProps } from "@/types/metrics";

const LIGHT = {
  surface: "#fcfcfb",
  textPrimary: "#0b0b0b",
  textMuted: "#898781",
  gridline: "#e1e0d9",
  increase: "#0ca30c",
  decrease: "#d03b3b",
  total: "#2a78d6",
};

const DARK = {
  surface: "#1a1a19",
  textPrimary: "#ffffff",
  textMuted: "#898781",
  gridline: "#2c2c2a",
  increase: "#0ca30c",
  decrease: "#e66767",
  total: "#3987e5",
};

function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function CashRunwayChart({
  companyName,
  steps = mockCashRunwaySteps,
}: Partial<CashRunwayChartProps>) {
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const palette = prefersDark ? DARK : LIGHT;

  const measure = steps.map((s) => (s.type === "total" ? "total" : "relative"));

  const data = useMemo(
    () => [
      {
        type: "waterfall" as const,
        orientation: "v" as const,
        measure,
        x: steps.map((s) => s.label),
        y: steps.map((s) => s.value),
        text: steps.map((s) => formatUSD(s.value)),
        textposition: "outside" as const,
        connector: { line: { color: palette.gridline, width: 1 } },
        increasing: { marker: { color: palette.increase } },
        decreasing: { marker: { color: palette.decrease } },
        totals: { marker: { color: palette.total } },
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ],
    [steps, palette.gridline, palette.increase, palette.decrease, palette.total],
  );

  return (
    <div className="w-full">
      <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
        {companyName ?? "示例公司"} · 现金流桥接
      </p>
      <Plot
        data={data}
        layout={{
          height: 340,
          margin: { t: 16, r: 16, b: 40, l: 56 },
          paper_bgcolor: palette.surface,
          plot_bgcolor: palette.surface,
          font: { color: palette.textMuted, size: 12 },
          showlegend: false,
          yaxis: { gridcolor: palette.gridline, tickfont: { color: palette.textMuted } },
          xaxis: { tickfont: { color: palette.textMuted } },
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%" }}
      />
    </div>
  );
}
