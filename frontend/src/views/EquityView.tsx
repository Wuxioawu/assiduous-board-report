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

export function EquityView() {
  const { companyId } = useParams();
  const { company, metrics, history, insight, isLoading, error, regenerate } = useAudienceDashboard(
    companyId,
    "equity",
    HISTORY_KEYS,
  );

  const revenueGrowth = findMetric(metrics?.growth, "revenue_yoy_growth");
  const customerGrowth = findMetric(metrics?.growth, "customer_count_growth");
  const customerCount = findMetric(metrics?.growth, "customer_count");
  const roce = findMetric(metrics?.returns, "roce");

  const revenueSeries = buildRevenueTrendSeries(history);
  const marginData = buildMarginBreakdown(history);

  return (
    <AppLayout>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">Equity Investor View</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        {company ? company.name : "Loading company…"}
      </p>
      <AudienceSwitcher />

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!isLoading && !error && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label="Revenue YoY Growth"
              value={formatMetricValue(revenueGrowth)}
              unit={metricUnitLabel(revenueGrowth)}
            />
            <MetricCard
              label="Customer Count"
              value={formatMetricValue(customerCount)}
              unit={metricUnitLabel(customerCount)}
              deltaPct={customerGrowth?.value}
            />
            <MetricCard label="ROCE" value={formatMetricValue(roce)} unit={metricUnitLabel(roce)} />
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
