import { useParams } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";
import { CashRunwayChart } from "@/charts/CashRunwayChart";
import { MarginBreakdownChart } from "@/charts/MarginBreakdownChart";
import { MetricCard } from "@/charts/MetricCard";
import { RevenueTrendChart } from "@/charts/RevenueTrendChart";

// Management view: Phase 1 renders the chart component shells against mock
// data purely to prove the visualization stack (recharts + plotly) works
// end-to-end. Real metrics wiring is Phase 2 (see ARCHITECTURE.md §8).
export function ManagementView() {
  const { companyId } = useParams();

  return (
    <AppLayout>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">Management View</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Company ID: {companyId} · Charts currently show placeholder data
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Quarterly Revenue" value="5.1M" unit="USD" deltaPct={-5.7} />
        <MetricCard label="Gross Margin" value="60.4" unit="%" deltaPct={2.6} />
        <MetricCard label="Cash Balance" value="4.29M" unit="USD" deltaPct={34.1} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <RevenueTrendChart />
        </Card>
        <Card>
          <MarginBreakdownChart />
        </Card>
        <Card className="lg:col-span-2">
          <CashRunwayChart />
        </Card>
      </div>
    </AppLayout>
  );
}
