import { useParams } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";

export function EquityView() {
  const { companyId } = useParams();

  return (
    <AppLayout>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">Equity View</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Company ID: {companyId}</p>
      <Card>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Equity investor view content will be implemented in the next phase.
        </p>
      </Card>
    </AppLayout>
  );
}
