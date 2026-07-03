import { useParams } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { AudienceSwitcher } from "@/components/layout/AudienceSwitcher";
import { InsightPanel } from "@/components/insights/InsightPanel";
import { Card } from "@/components/ui/Card";
import { MarginBreakdownChart } from "@/charts/MarginBreakdownChart";
import { MetricCard } from "@/charts/MetricCard";
import { RevenueTrendChart } from "@/charts/RevenueTrendChart";
import { useAudienceDashboard } from "@/hooks/useAudienceDashboard";
import {
  buildMarginBreakdown,
  buildRevenueTrendSeries,
  findMetric,
  formatMetricValue,
  metricUnitLabel,
} from "@/lib/dashboardData";

const HISTORY_KEYS = ["revenue", "gross_margin", "net_margin"];

export function BoardView() {
  const { companyId } = useParams();
  const { company, metrics, history, insight, isLoading, error, regenerate } = useAudienceDashboard(
    companyId,
    "board",
    HISTORY_KEYS,
  );

  const revenueGrowth = findMetric(metrics?.growth, "revenue_yoy_growth");
  const ebitdaMargin = findMetric(metrics?.profitability, "ebitda_margin");
  const dscr = findMetric(metrics?.solvency, "dscr");
  const leverage = findMetric(metrics?.solvency, "leverage_ratio");

  const revenueSeries = buildRevenueTrendSeries(history);
  const marginData = buildMarginBreakdown(history);

  return (
    <AppLayout>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">Board View</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        {company ? company.name : "Loading company…"}
      </p>
      <AudienceSwitcher />

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!isLoading && !error && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <MetricCard
              label="Revenue YoY Growth"
              value={formatMetricValue(revenueGrowth)}
              unit={metricUnitLabel(revenueGrowth)}
            />
            <MetricCard
              label="EBITDA Margin"
              value={formatMetricValue(ebitdaMargin)}
              unit={metricUnitLabel(ebitdaMargin)}
            />
            <MetricCard
              label="Debt Service Coverage"
              value={formatMetricValue(dscr)}
              unit={metricUnitLabel(dscr)}
              deltaDirectionGoodWhenUp={true}
            />
            <MetricCard
              label="Leverage Ratio"
              value={formatMetricValue(leverage)}
              unit={metricUnitLabel(leverage)}
              deltaDirectionGoodWhenUp={false}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              {revenueSeries.length > 0 ? (
                <RevenueTrendChart companyName={company?.name} series={revenueSeries} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Not enough periods for a revenue trend.</p>
              )}
            </Card>
            <Card>
              {marginData.length > 0 ? (
                <MarginBreakdownChart companyName={company?.name} data={marginData} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Not enough periods for a margin trend.</p>
              )}
            </Card>
          </div>

          <InsightPanel insight={insight} onRegenerate={regenerate} />
        </>
      )}
    </AppLayout>
  );
}
