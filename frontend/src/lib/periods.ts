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

/** Stable dedup/lookup key for a period range - shared by anything that needs to
 * match a period-scoped record (e.g. a FinancialStatement) back to the
 * CompanyPeriod it belongs to, since neither carries the other's ID. */
export function periodKeyOf(period: { period_start: string; period_end: string }): string {
  return `${period.period_start}|${period.period_end}`;
}

/** The single source of truth for how a period renders as text anywhere in the
 * app - the Period dropdown, page headers, every chart axis (Revenue Trend,
 * Margin Breakdown, Cash Flow Bridge), and the PDF export (via the mirrored
 * backend format_period_label in fiscal_periods.py) all derive from this, so
 * the same fiscal period never reads as two different strings on different
 * surfaces. `mode` controls how much renders:
 *   - "compact": main label only, e.g. "HY2026" - tight spaces like a
 *     dropdown option list.
 *   - "full" (default): main label + secondary date-span text, e.g.
 *     "HY2026 (6M to Dec 2025)" - headers and chart axes.
 *
 * Canonical text by period_type:
 *   - HY: "HY2026" / "(6M to Dec 2025)"
 *   - FY: "FY2025" / "(12M to Jun 2025)"
 *   - Q:  "Q2 FY2026" / "(3M to Dec 2025)"
 */
export function formatPeriodLabel(point: PeriodLabelFields, mode: "compact" | "full" = "full"): string {
  const end = monthYear(point.period_end);
  let main: string;
  let secondary: string;
  switch (point.period_type) {
    case "HY":
      main = `HY${point.fiscal_year}`;
      secondary = `(6M to ${end.month} ${end.year})`;
      break;
    case "FY":
      main = `FY${point.fiscal_year}`;
      secondary = `(12M to ${end.month} ${end.year})`;
      break;
    case "Q":
      main = `Q${point.fiscal_quarter ?? "?"} FY${point.fiscal_year}`;
      secondary = `(3M to ${end.month} ${end.year})`;
      break;
  }
  return mode === "compact" ? main : `${main} ${secondary}`;
}
