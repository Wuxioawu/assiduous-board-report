import { useParams } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { AudienceSwitcher } from "@/components/layout/AudienceSwitcher";
import { InsightPanel } from "@/components/insights/InsightPanel";
import { Card } from "@/components/ui/Card";
import { CashRunwayChart } from "@/charts/CashRunwayChart";
import { MetricCard } from "@/charts/MetricCard";
import { useAudienceDashboard } from "@/hooks/useAudienceDashboard";
import { buildEbitdaToFcfBridge, findMetric, formatMetricValue, metricUnitLabel } from "@/lib/dashboardData";

const HISTORY_KEYS: string[] = [];

export function CreditView() {
  const { companyId } = useParams();
  const { company, metrics, insight, isLoading, error, regenerate } = useAudienceDashboard(
    companyId,
    "credit",
    HISTORY_KEYS,
  );

  const dscr = findMetric(metrics?.solvency, "dscr");
  const leverage = findMetric(metrics?.solvency, "leverage_ratio");
  const cashRunway = findMetric(metrics?.cash, "cash_runway_months");
  const workingCapital = findMetric(metrics?.cash, "working_capital");

  const bridgeSteps = buildEbitdaToFcfBridge(metrics);

  return (
    <AppLayout>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">Credit Provider View</h1>
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
            <MetricCard
              label="Cash Runway"
              value={formatMetricValue(cashRunway)}
              unit={metricUnitLabel(cashRunway)}
            />
            <MetricCard
              label="Working Capital"
              value={formatMetricValue(workingCapital)}
              unit={metricUnitLabel(workingCapital)}
            />
          </div>

          <div className="mb-6">
            <Card>
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
