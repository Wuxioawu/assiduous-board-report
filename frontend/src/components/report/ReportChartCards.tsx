import { CashRunwayChart } from "@/charts/CashRunwayChart";
import { ChartEmptyState } from "@/charts/ChartEmptyState";
import { MarginBreakdownChart } from "@/charts/MarginBreakdownChart";
import { RevenueTrendChart } from "@/charts/RevenueTrendChart";
import { Card } from "@/components/ui/Card";
import type { CashRunwayStep, MarginBreakdownEntry, RevenueTrendSeries } from "@/types/metrics";

export function TrendCard({
  companyName,
  currency,
  revenueSeries,
  marginData,
}: {
  companyName?: string;
  currency: string;
  revenueSeries: RevenueTrendSeries[];
  marginData: MarginBreakdownEntry[];
}) {
  return (
    <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        {revenueSeries.length > 0 ? (
          <RevenueTrendChart companyName={companyName} series={revenueSeries} currency={currency} />
        ) : (
          <ChartEmptyState message="Not enough periods for a revenue trend." />
        )}
      </Card>
      <Card>
        {marginData.length > 0 ? (
          <MarginBreakdownChart companyName={companyName} data={marginData} />
        ) : (
          <ChartEmptyState message="Not enough periods for a margin trend." />
        )}
      </Card>
    </div>
  );
}

export function BridgeCard({
  companyName,
  currency,
  bridgeSteps,
}: {
  companyName?: string;
  currency: string;
  bridgeSteps: CashRunwayStep[];
}) {
  return (
    <Card>
      {bridgeSteps.length > 0 ? (
        <CashRunwayChart companyName={companyName} steps={bridgeSteps} currency={currency} />
      ) : (
        <ChartEmptyState message="EBITDA, CapEx, or Free Cash Flow not available for this period." />
      )}
    </Card>
  );
}
