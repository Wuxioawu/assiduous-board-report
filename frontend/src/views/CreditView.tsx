import { useParams } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/Card";

export function CreditView() {
  const { companyId } = useParams();

  return (
    <AppLayout>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">Credit View</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Company ID: {companyId}</p>
      <Card>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          信贷方视图内容将在下一阶段实现。
        </p>
      </Card>
    </AppLayout>
  );
}
