import type { PeriodType } from "@/types/metrics";

const LABELS: Record<PeriodType, string> = {
  FY: "Full Year",
  HY: "Half Year",
  Q: "Quarterly",
};

/** Guards Revenue Trend/Margin Breakdown against silently plotting a full-year
 * point next to a half-year one as if they were comparable (see
 * dashboardData.buildRevenueTrendSeries) - only rendered when a company's
 * data actually spans more than one period_type, since a company that has
 * only ever reported one has nothing to switch between. */
export function PeriodTypeToggle({
  available,
  selected,
  onChange,
}: {
  available: PeriodType[];
  selected: PeriodType | null;
  onChange: (periodType: PeriodType) => void;
}) {
  if (available.length < 2) return null;
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span>Trend</span>
      <span className="inline-flex rounded-md border border-surface-border bg-white p-0.5">
        {available.map((type) => {
          const isActive = type === selected;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange(type)}
              aria-pressed={isActive}
              className={`min-h-[36px] rounded px-3 text-sm font-medium transition-colors ${
                isActive ? "bg-coral text-white" : "text-muted hover:text-navy"
              }`}
            >
              {LABELS[type]}
            </button>
          );
        })}
      </span>
    </div>
  );
}
