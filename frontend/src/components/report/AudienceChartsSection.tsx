import { CashRunwayChart } from "@/charts/CashRunwayChart";
import { GenericChart } from "@/charts/GenericChart";
import { GenericChartCard } from "@/charts/GenericChartCard";
import { MilestoneTimeline } from "@/charts/MilestoneTimeline";
import { Card } from "@/components/ui/Card";
import type { ChartConfig } from "@/types/chart";
import type { CashRunwayStep } from "@/types/metrics";

function toWaterfallSteps(config: ChartConfig): CashRunwayStep[] {
  const points = config.series[0]?.points ?? [];
  return points.map((p, i) => {
    const isEndpoint = i === 0 || i === points.length - 1;
    return {
      label: p.step_label ?? "",
      value: p.value,
      type: isEndpoint ? "total" : p.value >= 0 ? "increase" : "decrease",
    };
  });
}

/** Renders whichever GET .../charts entries are new for this task (per-tab
 * cards + charts - see services/charts/registry.py) - NOT revenue_card,
 * revenue_trend, margin_breakdown, or cash_flow_bridge, which already have
 * dedicated integration points elsewhere (ReportView's revenueSourceRefs/
 * revenueSeries/marginData/bridgeSteps, threaded into the pre-existing
 * TrendCard/BridgeCard) - rendering those again here would duplicate them
 * on the page. Callers should already have filtered `charts` down to one
 * audience and excluded those four ids (see ReportView.audienceCharts). */
export function AudienceChartsSection({ charts, currency }: { charts: ChartConfig[]; currency: string }) {
  const cardConfigs = charts.filter((c) => c.chart_type === "card");
  const otherConfigs = charts.filter((c) => c.chart_type !== "card");

  if (cardConfigs.length === 0 && otherConfigs.length === 0) return null;

  return (
    <>
      {cardConfigs.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cardConfigs.map((c) => (
            <GenericChartCard key={c.id} config={c} currency={currency} />
          ))}
        </div>
      )}
      {otherConfigs.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {otherConfigs.map((c) => (
            <Card key={c.id}>
              {c.chart_type === "waterfall" ? (
                <CashRunwayChart steps={toWaterfallSteps(c)} currency={currency} />
              ) : c.chart_type === "milestone" ? (
                <MilestoneTimeline config={c} />
              ) : (
                <GenericChart config={c} currency={currency} />
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
