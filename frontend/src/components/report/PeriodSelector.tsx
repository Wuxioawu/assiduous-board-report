import { formatPeriodLabel } from "@/lib/periods";
import type { CompanyPeriod } from "@/types/company";

export function PeriodSelector({
  periods,
  selected,
  onChange,
}: {
  periods: CompanyPeriod[];
  selected?: string;
  onChange: (periodEnd: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Period
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] flex-1 rounded-md border border-surface-border bg-white px-2 py-1 text-sm font-medium text-navy outline-none focus:border-coral focus:ring-1 focus:ring-coral sm:min-h-0 sm:flex-none"
      >
        {periods.map((p) => (
          <option key={p.period_end} value={p.period_end}>
            {formatPeriodLabel(p, "compact")}
          </option>
        ))}
      </select>
    </label>
  );
}
