import { Link, useParams } from "react-router-dom";

import type { Audience } from "@/types/insight";

const TABS: { value: Audience; label: string }[] = [
  { value: "management", label: "Management" },
  { value: "board", label: "Board" },
  { value: "equity", label: "Equity Investors" },
  { value: "credit", label: "Credit Providers" },
];

export function AudienceSwitcher({ activeAudience }: { activeAudience: Audience }) {
  const { companyId } = useParams<{ companyId: string }>();
  if (!companyId) return null;

  return (
    <nav className="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-800">
      {TABS.map((tab) => {
        const isActive = tab.value === activeAudience;
        return (
          <Link
            key={tab.value}
            to={`/companies/${companyId}/report?audience=${tab.value}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              isActive
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
