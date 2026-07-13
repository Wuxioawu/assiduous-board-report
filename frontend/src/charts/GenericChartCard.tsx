import { MetricCard } from "@/charts/MetricCard";
import { formatChartValue } from "@/lib/chartFormat";
import type { ChartConfig } from "@/types/chart";

/** Renders any chart_type="card" ChartConfig from GET .../charts through the
 * same MetricCard every other scalar metric uses - one rendering path for
 * "a single number with a label, unit, and provenance popover" rather than
 * a bespoke component per new audience-specific card (gross margin, opex,
 * shares outstanding, net cash, etc. - see services/charts/registry.py). */
export function GenericChartCard({ config, currency }: { config: ChartConfig; currency: string }) {
  const point = config.series[0]?.points[0];
  if (!point) return null;
  return (
    <MetricCard
      label={config.display_name}
      value={formatChartValue(point.value, config.format, currency)}
      sourceRefs={point.source_refs.length > 0 ? point.source_refs : undefined}
      note={config.annotation ?? undefined}
    />
  );
}
