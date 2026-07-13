import type { CompanyPeriod } from "@/types/company";
import type { PeriodLabelFields } from "@/types/metrics";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(isoDate: string): { month: string; year: number } {
  // getUTC*, not local getMonth/getFullYear: period_start/period_end are
  // date-only strings pinned to UTC midnight, and reading them back with local
  // getters can shift the displayed month/year by a day in negative-offset
  // timezones.
  const d = new Date(isoDate);
  return { month: MONTH_ABBR[d.getUTCMonth()], year: d.getUTCFullYear() };
}

/** Compact "Jul–Dec 2025" (same year) or "Jul 2025 – Jun 2026" (spans years)
 * range, used as supporting detail next to a period's fiscal label. */
export function formatPeriodDateRange(periodStart: string, periodEnd: string): string {
  const start = monthYear(periodStart);
  const end = monthYear(periodEnd);
  if (start.year === end.year) {
    return `${start.month}–${end.month} ${start.year}`;
  }
  return `${start.month} ${start.year} – ${end.month} ${end.year}`;
}

/** Text for a period <option>: the fiscal label when the company has a
 * configured reporting cadence, otherwise the raw date range exactly as
 * before - see CompanyPeriod.fiscal_label, which is null for companies
 * without one configured. Native <option> elements can't carry separate
 * "smaller muted subtext" styling, so callers pair this with
 * formatPeriodDateRange rendered alongside the select for the current
 * selection instead. */
export function formatPeriodOptionLabel(period: CompanyPeriod): string {
  return period.fiscal_label ?? `${period.period_start} → ${period.period_end}`;
}

/** Stable dedup/lookup key for a period range - shared by anything that needs to
 * match a period-scoped record (e.g. a FinancialStatement) back to the
 * CompanyPeriod it belongs to, since neither carries the other's ID. */
export function periodKeyOf(period: { period_start: string; period_end: string }): string {
  return `${period.period_start}|${period.period_end}`;
}

/** The single source of truth for how a period_type-aware point/entry renders as
 * text - every chart (Revenue Trend, Margin Breakdown, Cash Flow Bridge) and any
 * metric card period caption must go through this rather than building its own
 * format, so a half-year point is never mislabeled as a quarter or full year (see
 * PeriodLabelFields for where fiscal_year/fiscal_quarter come from - computed
 * server-side since they require the company's fiscal_year_start_month):
 *   - HY: "HY2026 (6M to Dec 2025)"
 *   - FY: "FY2025 (to Jun 2025)"
 *   - Q:  "Q2 FY2026"
 */
export function formatPeriodLabel(point: PeriodLabelFields): string {
  const end = monthYear(point.period_end);
  switch (point.period_type) {
    case "HY":
      return `HY${point.fiscal_year} (6M to ${end.month} ${end.year})`;
    case "FY":
      return `FY${point.fiscal_year} (to ${end.month} ${end.year})`;
    case "Q":
      return `Q${point.fiscal_quarter ?? "?"} FY${point.fiscal_year}`;
  }
}
