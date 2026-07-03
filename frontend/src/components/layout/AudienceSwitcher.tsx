import { NavLink, useParams } from "react-router-dom";

const TABS = [
  { to: "management", label: "Management" },
  { to: "board", label: "Board" },
  { to: "equity", label: "Equity Investors" },
  { to: "credit", label: "Credit Providers" },
];

export function AudienceSwitcher() {
  const { companyId } = useParams<{ companyId: string }>();
  if (!companyId) return null;

  return (
    <nav className="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-800">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={`/companies/${companyId}/${tab.to}`}
          className={({ isActive }) =>
            `-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              isActive
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
