import { MetricCard } from "@/charts/MetricCard";
import { AudienceChartsSection } from "@/components/report/AudienceChartsSection";
import { BridgeCard, TrendCard } from "@/components/report/ReportChartCards";
import {
  buildAddMissingLineItemHref,
  buildBenchmarkComparison,
  buildBudgetComparison,
  findMetric,
  formatMetricValue,
  metricMissingReason,
  metricUnitLabel,
} from "@/lib/dashboardData";
import type { ChartConfig, SourceRef } from "@/types/chart";
import type { CashRunwayStep, MarginBreakdownEntry, MetricsResponse, RevenueTrendSeries } from "@/types/metrics";

const BUDGET_COMPARABLE_METRICS: { key: string; label: string; category: "growth" | "profitability" }[] = [
  { key: "revenue", label: "Revenue", category: "growth" },
  { key: "ebitda", label: "EBITDA", category: "profitability" },
  { key: "operating_expenses", label: "Operating Expenses", category: "profitability" },
  { key: "net_income", label: "Net Income", category: "profitability" },
];

/** Purely additive: renders nothing unless at least one budget-comparable metric
 * has a budget_value set for the current period, so companies/periods with no
 * budget configured are entirely unaffected. Shared across all four audience
 * views so variance shows up consistently regardless of which tab is active. */
export function BudgetVarianceSection({ metrics, currency }: { metrics: MetricsResponse | null; currency: string }) {
  if (!metrics) return null;

  const cards = BUDGET_COMPARABLE_METRICS.map(({ key, label, category }) => ({
    label,
    metric: findMetric(metrics[category], key),
  })).filter((c): c is { label: string; metric: NonNullable<typeof c.metric> } => c.metric?.budget_value != null);

  if (cards.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-base font-semibold text-navy">Budget vs. Actual</h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, metric }) => (
          <MetricCard
            key={label}
            label={label}
            value={formatMetricValue(metric, currency)}
            unit={metricUnitLabel(metric)}
            budget={buildBudgetComparison(metric, currency)}
          />
        ))}
      </div>
    </div>
  );
}

export function ManagementSection({
  metrics,
  companyName,
  companyId,
  currency,
  revenueSeries,
  marginData,
  bridgeSteps,
  revenueSourceRefs,
  audienceCharts,
}: {
  metrics: MetricsResponse | null;
  companyName?: string;
  companyId?: string;
  currency: string;
  revenueSeries: RevenueTrendSeries[];
  marginData: MarginBreakdownEntry[];
  bridgeSteps: CashRunwayStep[];
  revenueSourceRefs?: SourceRef[];
  audienceCharts: ChartConfig[];
}) {
  const documentsHref = companyId ? `/companies/${companyId}/documents/financial-data` : undefined;
  const revenue = findMetric(metrics?.growth, "revenue");
  const revenueGrowth = findMetric(metrics?.growth, "revenue_yoy_growth");
  const grossMargin = findMetric(metrics?.profitability, "gross_margin");
  const cashBalance = findMetric(metrics?.cash, "cash_balance");

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <MetricCard
          label="Revenue"
          value={formatMetricValue(revenue, currency)}
          unit={metricUnitLabel(revenue)}
          deltaPct={revenueGrowth?.value ?? undefined}
          reason={metricMissingReason(revenue)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, revenue, metrics?.period_start, metrics?.period_end)}
          sourceRefs={revenueSourceRefs}
        />
        <MetricCard
          label="Gross Margin"
          value={formatMetricValue(grossMargin, currency)}
          unit={metricUnitLabel(grossMargin)}
          benchmark={buildBenchmarkComparison(grossMargin)}
          reason={metricMissingReason(grossMargin)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, grossMargin, metrics?.period_start, metrics?.period_end)}
        />
        <MetricCard
          label="Cash Balance"
          value={formatMetricValue(cashBalance, currency)}
          unit={metricUnitLabel(cashBalance)}
          reason={metricMissingReason(cashBalance)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, cashBalance, metrics?.period_start, metrics?.period_end)}
        />
      </div>
      <TrendCard companyName={companyName} currency={currency} revenueSeries={revenueSeries} marginData={marginData} />
      <div className="mb-8">
        <BridgeCard companyName={companyName} currency={currency} bridgeSteps={bridgeSteps} />
      </div>
      <AudienceChartsSection charts={audienceCharts} currency={currency} />
    </>
  );
}

export function BoardSection({
  metrics,
  companyName,
  companyId,
  currency,
  revenueSeries,
  marginData,
  audienceCharts,
}: {
  metrics: MetricsResponse | null;
  companyName?: string;
  companyId?: string;
  currency: string;
  revenueSeries: RevenueTrendSeries[];
  marginData: MarginBreakdownEntry[];
  audienceCharts: ChartConfig[];
}) {
  const documentsHref = companyId ? `/companies/${companyId}/documents/financial-data` : undefined;
  const revenueGrowth = findMetric(metrics?.growth, "revenue_yoy_growth");
  const ebitdaMargin = findMetric(metrics?.profitability, "ebitda_margin");
  const dscr = findMetric(metrics?.solvency, "dscr");
  const leverage = findMetric(metrics?.solvency, "leverage_ratio");

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-4">
        <MetricCard
          label="Revenue YoY Growth"
          value={formatMetricValue(revenueGrowth, currency)}
          unit={metricUnitLabel(revenueGrowth)}
          reason={metricMissingReason(revenueGrowth)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, revenueGrowth, metrics?.period_start, metrics?.period_end)}
        />
        <MetricCard
          label="EBITDA Margin"
          value={formatMetricValue(ebitdaMargin, currency)}
          unit={metricUnitLabel(ebitdaMargin)}
          benchmark={buildBenchmarkComparison(ebitdaMargin)}
          reason={metricMissingReason(ebitdaMargin)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, ebitdaMargin, metrics?.period_start, metrics?.period_end)}
        />
        <MetricCard
          label="Debt Service Coverage"
          value={formatMetricValue(dscr, currency)}
          unit={metricUnitLabel(dscr)}
          deltaDirectionGoodWhenUp={true}
          benchmark={buildBenchmarkComparison(dscr)}
          reason={metricMissingReason(dscr)}
          notMeaningful={dscr?.not_meaningful}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, dscr, metrics?.period_start, metrics?.period_end)}
        />
        <MetricCard
          label="Leverage Ratio"
          value={formatMetricValue(leverage, currency)}
          unit={metricUnitLabel(leverage)}
          deltaDirectionGoodWhenUp={false}
          benchmark={buildBenchmarkComparison(leverage)}
          reason={metricMissingReason(leverage)}
          notMeaningful={leverage?.not_meaningful}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, leverage, metrics?.period_start, metrics?.period_end)}
        />
      </div>
      <TrendCard companyName={companyName} currency={currency} revenueSeries={revenueSeries} marginData={marginData} />
      <AudienceChartsSection charts={audienceCharts} currency={currency} />
    </>
  );
}

export function EquitySection({
  metrics,
  companyName,
  companyId,
  currency,
  revenueSeries,
  marginData,
  audienceCharts,
}: {
  metrics: MetricsResponse | null;
  companyName?: string;
  companyId?: string;
  currency: string;
  revenueSeries: RevenueTrendSeries[];
  marginData: MarginBreakdownEntry[];
  audienceCharts: ChartConfig[];
}) {
  const documentsHref = companyId ? `/companies/${companyId}/documents/financial-data` : undefined;
  const revenueGrowth = findMetric(metrics?.growth, "revenue_yoy_growth");
  const customerGrowth = findMetric(metrics?.growth, "customer_count_growth");
  const customerCount = findMetric(metrics?.growth, "customer_count");
  const roce = findMetric(metrics?.returns, "roce");

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <MetricCard
          label="Revenue YoY Growth"
          value={formatMetricValue(revenueGrowth, currency)}
          unit={metricUnitLabel(revenueGrowth)}
          reason={metricMissingReason(revenueGrowth)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, revenueGrowth, metrics?.period_start, metrics?.period_end)}
        />
        <MetricCard
          label="Customer Count"
          value={formatMetricValue(customerCount, currency)}
          unit={metricUnitLabel(customerCount)}
          deltaPct={customerGrowth?.value ?? undefined}
          reason={metricMissingReason(customerCount)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, customerCount, metrics?.period_start, metrics?.period_end)}
        />
        <MetricCard
          label="ROCE"
          value={formatMetricValue(roce, currency)}
          unit={metricUnitLabel(roce)}
          benchmark={buildBenchmarkComparison(roce)}
          reason={metricMissingReason(roce)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, roce, metrics?.period_start, metrics?.period_end)}
        />
      </div>
      <TrendCard companyName={companyName} currency={currency} revenueSeries={revenueSeries} marginData={marginData} />
      <AudienceChartsSection charts={audienceCharts} currency={currency} />
    </>
  );
}

export function CreditSection({
  metrics,
  companyName,
  companyId,
  currency,
  bridgeSteps,
  audienceCharts,
}: {
  metrics: MetricsResponse | null;
  companyName?: string;
  companyId?: string;
  currency: string;
  bridgeSteps: CashRunwayStep[];
  audienceCharts: ChartConfig[];
}) {
  const documentsHref = companyId ? `/companies/${companyId}/documents/financial-data` : undefined;
  const dscr = findMetric(metrics?.solvency, "dscr");
  const leverage = findMetric(metrics?.solvency, "leverage_ratio");
  const cashRunway = findMetric(metrics?.cash, "cash_runway_months");
  const workingCapital = findMetric(metrics?.cash, "working_capital");

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-4">
        <MetricCard
          label="Debt Service Coverage"
          value={formatMetricValue(dscr, currency)}
          unit={metricUnitLabel(dscr)}
          deltaDirectionGoodWhenUp={true}
          benchmark={buildBenchmarkComparison(dscr)}
          reason={metricMissingReason(dscr)}
          notMeaningful={dscr?.not_meaningful}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, dscr, metrics?.period_start, metrics?.period_end)}
        />
        <MetricCard
          label="Leverage Ratio"
          value={formatMetricValue(leverage, currency)}
          unit={metricUnitLabel(leverage)}
          deltaDirectionGoodWhenUp={false}
          benchmark={buildBenchmarkComparison(leverage)}
          reason={metricMissingReason(leverage)}
          notMeaningful={leverage?.not_meaningful}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, leverage, metrics?.period_start, metrics?.period_end)}
        />
        <MetricCard
          label="Cash Runway"
          value={formatMetricValue(cashRunway, currency)}
          unit={metricUnitLabel(cashRunway)}
          reason={metricMissingReason(cashRunway)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, cashRunway, metrics?.period_start, metrics?.period_end)}
        />
        <MetricCard
          label="Working Capital"
          value={formatMetricValue(workingCapital, currency)}
          unit={metricUnitLabel(workingCapital)}
          reason={metricMissingReason(workingCapital)}
          documentsHref={documentsHref}
          addMissingHref={buildAddMissingLineItemHref(companyId, workingCapital, metrics?.period_start, metrics?.period_end)}
        />
      </div>
      <div className="mb-8">
        <BridgeCard companyName={companyName} currency={currency} bridgeSteps={bridgeSteps} />
      </div>
      <AudienceChartsSection charts={audienceCharts} currency={currency} />
    </>
  );
}
