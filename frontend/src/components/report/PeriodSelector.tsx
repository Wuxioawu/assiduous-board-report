import { formatPeriodDateRange, formatPeriodOptionLabel } from "@/lib/periods";
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
  const selectedPeriod = periods.find((p) => p.period_end === selected);
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Period
      <span className="flex flex-1 items-baseline gap-1.5 sm:flex-none">
        <select
          value={selected ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[44px] flex-1 rounded-md border border-surface-border bg-white px-2 py-1 text-sm font-medium text-navy outline-none focus:border-coral focus:ring-1 focus:ring-coral sm:min-h-0 sm:flex-none"
        >
          {periods.map((p) => (
            <option key={p.period_end} value={p.period_end}>
              {formatPeriodOptionLabel(p)}
            </option>
          ))}
        </select>
        {/* Only shown when the company has a configured reporting cadence - the
         * fiscal label above already IS the raw date range otherwise, so this
         * would be redundant (see item 8: no visual regression for unconfigured
         * companies). */}
        {selectedPeriod?.fiscal_label && (
          <span className="whitespace-nowrap text-xs text-muted">
            ({formatPeriodDateRange(selectedPeriod.period_start, selectedPeriod.period_end)})
          </span>
        )}
      </span>
    </label>
  );
}
