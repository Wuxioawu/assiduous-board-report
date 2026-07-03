import { useParams } from "react-router-dom";

import { AudienceSwitcher } from "@/components/layout/AudienceSwitcher";
import { AppLayout } from "@/components/layout/AppLayout";
import { InsightPanel } from "@/components/insights/InsightPanel";
import { Card } from "@/components/ui/Card";
import { CashRunwayChart } from "@/charts/CashRunwayChart";
import { MarginBreakdownChart } from "@/charts/MarginBreakdownChart";
import { MetricCard } from "@/charts/MetricCard";
import { RevenueTrendChart } from "@/charts/RevenueTrendChart";
import { useAudienceDashboard } from "@/hooks/useAudienceDashboard";
import {
  buildEbitdaToFcfBridge,
  buildMarginBreakdown,
  buildRevenueTrendSeries,
  findMetric,
  formatMetricValue,
  metricUnitLabel,
} from "@/lib/dashboardData";

const HISTORY_KEYS = ["revenue", "gross_margin", "net_margin"];

export function ManagementView() {
  const { companyId } = useParams();
  const { company, metrics, history, insight, isLoading, error, regenerate } = useAudienceDashboard(
    companyId,
    "management",
    HISTORY_KEYS,
  );

  const revenue = findMetric(metrics?.growth, "revenue");
  const revenueGrowth = findMetric(metrics?.growth, "revenue_yoy_growth");
  const grossMargin = findMetric(metrics?.profitability, "gross_margin");
  const cashBalance = findMetric(metrics?.cash, "cash_balance");

  const revenueSeries = buildRevenueTrendSeries(history);
  const marginData = buildMarginBreakdown(history);
  const bridgeSteps = buildEbitdaToFcfBridge(metrics);

  return (
    <AppLayout>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">Management View</h1>
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
              label="Revenue"
              value={formatMetricValue(revenue)}
              unit={metricUnitLabel(revenue)}
              deltaPct={revenueGrowth?.value}
            />
            <MetricCard
              label="Gross Margin"
              value={formatMetricValue(grossMargin)}
              unit={metricUnitLabel(grossMargin)}
            />
            <MetricCard
              label="Cash Balance"
              value={formatMetricValue(cashBalance)}
              unit={metricUnitLabel(cashBalance)}
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
            <Card className="lg:col-span-2">
              {bridgeSteps.length > 0 ? (
                <CashRunwayChart companyName={company?.name} steps={bridgeSteps} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  EBITDA, CapEx, or Free Cash Flow not available for this period.
                </p>
              )}
            </Card>
          </div>

          <InsightPanel insight={insight} onRegenerate={regenerate} />
        </>
      )}
    </AppLayout>
  );
}
