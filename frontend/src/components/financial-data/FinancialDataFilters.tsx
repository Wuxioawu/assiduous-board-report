import { Search } from "lucide-react";

import { formatPeriodDateRange, formatPeriodOptionLabel, periodKeyOf } from "@/lib/periods";
import type { CompanyPeriod } from "@/types/company";

export type SourceFilter = "all" | "ai" | "manual_override" | "manual_entry";

const SOURCE_FILTER_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ai", label: "AI Extracted" },
  { value: "manual_override", label: "Manually Overridden" },
  { value: "manual_entry", label: "Manually Added" },
];

export function FinancialDataFilters({
  searchInput,
  onSearchInputChange,
  periods,
  periodFilter,
  onPeriodFilterChange,
  selectedFilterPeriod,
  sourceFilter,
  onSourceFilterChange,
  hasActiveFilters,
  onClearFilters,
  filteredCount,
  totalCount,
}: {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  periods: CompanyPeriod[];
  periodFilter: string;
  onPeriodFilterChange: (value: string) => void;
  selectedFilterPeriod: CompanyPeriod | undefined;
  sourceFilter: SourceFilter;
  onSourceFilterChange: (value: SourceFilter) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  filteredCount: number;
  totalCount: number;
}) {
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            placeholder="Search taxonomy code or source…"
            aria-label="Search financial data"
            className="w-full rounded-lg border border-surface-border bg-white py-2 pl-9 pr-3 text-sm text-navy outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral"
          />
        </div>

        <span className="flex items-baseline gap-1.5">
          <select
            value={periodFilter}
            onChange={(e) => onPeriodFilterChange(e.target.value)}
            aria-label="Filter by period"
            className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral"
          >
            <option value="all">All periods</option>
            {periods.map((period) => (
              <option key={periodKeyOf(period)} value={periodKeyOf(period)}>
                {formatPeriodOptionLabel(period)}
              </option>
            ))}
          </select>
          {selectedFilterPeriod?.fiscal_label && (
            <span className="whitespace-nowrap text-xs text-muted">
              ({formatPeriodDateRange(selectedFilterPeriod.period_start, selectedFilterPeriod.period_end)})
            </span>
          )}
        </span>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by source type">
          {SOURCE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSourceFilterChange(opt.value)}
              aria-pressed={sourceFilter === opt.value}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                sourceFilter === opt.value
                  ? "border-coral bg-coral text-white"
                  : "border-surface-border text-muted hover:bg-cream"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-sm font-medium text-coral transition-colors hover:underline sm:ml-auto"
          >
            Clear filters
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <p className="mb-3 text-sm text-muted">
          Showing {filteredCount} of {totalCount} line item
          {totalCount === 1 ? "" : "s"}
        </p>
      )}
    </>
  );
}
