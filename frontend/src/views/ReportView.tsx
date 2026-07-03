import { useParams, useSearchParams } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { AudienceSwitcher } from "@/components/layout/AudienceSwitcher";
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
import type { Audience } from "@/types/insight";
import type { CashRunwayStep, MarginBreakdownEntry, MetricsResponse, RevenueTrendSeries } from "@/types/metrics";

const VALID_AUDIENCES: Audience[] = ["management", "board", "equity", "credit"];

const AUDIENCE_TITLES: Record<Audience, string> = {
  management: "Management View",
  board: "Board View",
  equity: "Equity Investor View",
  credit: "Credit Provider View",
};

const HISTORY_KEYS_BY_AUDIENCE: Record<Audience, string[]> = {
  management: ["revenue", "gross_margin", "net_margin"],
  board: ["revenue", "gross_margin", "net_margin"],
  equity: ["revenue", "gross_margin", "net_margin"],
  credit: [],
};

function parseAudience(value: string | null): Audience {
  return VALID_AUDIENCES.includes(value as Audience) ? (value as Audience) : "management";
}

export function ReportView() {
  const { companyId } = useParams();
  const [searchParams] = useSearchParams();
  const audience = parseAudience(searchParams.get("audience"));

  const { company, metrics, history, insight, isLoading, error, regenerate } = useAudienceDashboard(
    companyId,
    audience,
    HISTORY_KEYS_BY_AUDIENCE[audience],
  );

  const revenueSeries = buildRevenueTrendSeries(history);
  const marginData = buildMarginBreakdown(history);
  const bridgeSteps = buildEbitdaToFcfBridge(metrics);

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">{AUDIENCE_TITLES[audience]}</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        {company ? company.name : "Loading company…"}
      </p>
      <AudienceSwitcher activeAudience={audience} />

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!isLoading && !error && (
        <>
          {audience === "management" && (
            <ManagementSection
              metrics={metrics}
              companyName={company?.name}
              revenueSeries={revenueSeries}
              marginData={marginData}
              bridgeSteps={bridgeSteps}
            />
          )}
          {audience === "board" && (
            <BoardSection
              metrics={metrics}
              companyName={company?.name}
              revenueSeries={revenueSeries}
              marginData={marginData}
            />
          )}
          {audience === "equity" && (
            <EquitySection
              metrics={metrics}
              companyName={company?.name}
              revenueSeries={revenueSeries}
              marginData={marginData}
            />
          )}
          {audience === "credit" && <CreditSection metrics={metrics} companyName={company?.name} bridgeSteps={bridgeSteps} />}

          <InsightPanel insight={insight} onRegenerate={regenerate} />
        </>
      )}
    </AppShell>
  );
}

function TrendCard({
  companyName,
  revenueSeries,
  marginData,
}: {
  companyName?: string;
  revenueSeries: RevenueTrendSeries[];
  marginData: MarginBreakdownEntry[];
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        {revenueSeries.length > 0 ? (
          <RevenueTrendChart companyName={companyName} series={revenueSeries} />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Not enough periods for a revenue trend.</p>
        )}
      </Card>
      <Card>
        {marginData.length > 0 ? (
          <MarginBreakdownChart companyName={companyName} data={marginData} />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Not enough periods for a margin trend.</p>
        )}
      </Card>
    </div>
  );
}

function BridgeCard({ companyName, bridgeSteps }: { companyName?: string; bridgeSteps: CashRunwayStep[] }) {
  return (
    <Card>
      {bridgeSteps.length > 0 ? (
        <CashRunwayChart companyName={companyName} steps={bridgeSteps} />
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          EBITDA, CapEx, or Free Cash Flow not available for this period.
        </p>
      )}
    </Card>
  );
}

function ManagementSection({
  metrics,
  companyName,
  revenueSeries,
  marginData,
  bridgeSteps,
}: {
  metrics: MetricsResponse | null;
  companyName?: string;
  revenueSeries: RevenueTrendSeries[];
  marginData: MarginBreakdownEntry[];
  bridgeSteps: CashRunwayStep[];
}) {
  const revenue = findMetric(metrics?.growth, "revenue");
  const revenueGrowth = findMetric(metrics?.growth, "revenue_yoy_growth");
  const grossMargin = findMetric(metrics?.profitability, "gross_margin");
  const cashBalance = findMetric(metrics?.cash, "cash_balance");

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Revenue"
          value={formatMetricValue(revenue)}
          unit={metricUnitLabel(revenue)}
          deltaPct={revenueGrowth?.value}
        />
        <MetricCard label="Gross Margin" value={formatMetricValue(grossMargin)} unit={metricUnitLabel(grossMargin)} />
        <MetricCard label="Cash Balance" value={formatMetricValue(cashBalance)} unit={metricUnitLabel(cashBalance)} />
      </div>
      <TrendCard companyName={companyName} revenueSeries={revenueSeries} marginData={marginData} />
      <div className="mb-6">
        <BridgeCard companyName={companyName} bridgeSteps={bridgeSteps} />
      </div>
    </>
  );
}

function BoardSection({
  metrics,
  companyName,
  revenueSeries,
  marginData,
}: {
  metrics: MetricsResponse | null;
  companyName?: string;
  revenueSeries: RevenueTrendSeries[];
  marginData: MarginBreakdownEntry[];
}) {
  const revenueGrowth = findMetric(metrics?.growth, "revenue_yoy_growth");
  const ebitdaMargin = findMetric(metrics?.profitability, "ebitda_margin");
  const dscr = findMetric(metrics?.solvency, "dscr");
  const leverage = findMetric(metrics?.solvency, "leverage_ratio");

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Revenue YoY Growth"
          value={formatMetricValue(revenueGrowth)}
          unit={metricUnitLabel(revenueGrowth)}
        />
        <MetricCard label="EBITDA Margin" value={formatMetricValue(ebitdaMargin)} unit={metricUnitLabel(ebitdaMargin)} />
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
      <TrendCard companyName={companyName} revenueSeries={revenueSeries} marginData={marginData} />
    </>
  );
}

function EquitySection({
  metrics,
  companyName,
  revenueSeries,
  marginData,
}: {
  metrics: MetricsResponse | null;
  companyName?: string;
  revenueSeries: RevenueTrendSeries[];
  marginData: MarginBreakdownEntry[];
}) {
  const revenueGrowth = findMetric(metrics?.growth, "revenue_yoy_growth");
  const customerGrowth = findMetric(metrics?.growth, "customer_count_growth");
  const customerCount = findMetric(metrics?.growth, "customer_count");
  const roce = findMetric(metrics?.returns, "roce");

  return (
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
      <TrendCard companyName={companyName} revenueSeries={revenueSeries} marginData={marginData} />
    </>
  );
}

function CreditSection({
  metrics,
  companyName,
  bridgeSteps,
}: {
  metrics: MetricsResponse | null;
  companyName?: string;
  bridgeSteps: CashRunwayStep[];
}) {
  const dscr = findMetric(metrics?.solvency, "dscr");
  const leverage = findMetric(metrics?.solvency, "leverage_ratio");
  const cashRunway = findMetric(metrics?.cash, "cash_runway_months");
  const workingCapital = findMetric(metrics?.cash, "working_capital");

  return (
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
        <MetricCard label="Cash Runway" value={formatMetricValue(cashRunway)} unit={metricUnitLabel(cashRunway)} />
        <MetricCard
          label="Working Capital"
          value={formatMetricValue(workingCapital)}
          unit={metricUnitLabel(workingCapital)}
        />
      </div>
      <div className="mb-6">
        <BridgeCard companyName={companyName} bridgeSteps={bridgeSteps} />
      </div>
    </>
  );
}
