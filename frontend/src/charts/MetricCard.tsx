import { FileText, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { formatCurrency } from "@/lib/formatCurrency";
import type { SourceRef } from "@/types/chart";
import type { MetricCardProps } from "@/types/metrics";

// Grace period between the cursor leaving the icon/tooltip and the tooltip actually
// closing, so a user moving diagonally from the icon toward the tooltip's link doesn't
// have it vanish mid-move (there's a real gap between the two elements to cross).
const HIDE_DELAY_MS = 400;

/** Shared open/close mechanics for a hover-or-click icon+tooltip pair (used by
 * both MissingDataHint and SourceProvenanceHint below) - hover opens/keeps
 * open, a click toggles it (for touch devices with no hover), and clicking
 * anywhere outside closes it. */
function useHoverPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelHide() {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }

  function scheduleHide() {
    cancelHide();
    hideTimeoutRef.current = setTimeout(() => setIsOpen(false), HIDE_DELAY_MS);
  }

  useEffect(() => {
    return cancelHide;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        cancelHide();
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return {
    isOpen,
    containerRef,
    triggerProps: {
      "aria-expanded": isOpen,
      onClick: () => {
        cancelHide();
        setIsOpen((v) => !v);
      },
      onMouseEnter: () => {
        cancelHide();
        setIsOpen(true);
      },
      onMouseLeave: scheduleHide,
    },
    tooltipProps: {
      "aria-hidden": !isOpen,
      onMouseEnter: cancelHide,
      onMouseLeave: scheduleHide,
    },
  };
}

/** Small hover/tap affordance next to a "—" value, explaining why it's
 * missing and linking to where a user would go fix it. */
function MissingDataHint({
  reason,
  notMeaningful,
  documentsHref,
  addMissingHref,
}: {
  reason: string;
  // True for MetricValue.not_meaningful (see types/metrics.ts) - the data IS
  // present, the ratio itself just isn't meaningful (e.g. DSCR over a
  // negative EBITDA) - a different situation from ordinary missing data, so
  // it gets different wording and no "go add the missing line item" link
  // (there's nothing to add).
  notMeaningful?: boolean;
  documentsHref?: string;
  addMissingHref?: string;
}) {
  const { isOpen, containerRef, triggerProps, tooltipProps } = useHoverPopover();

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={notMeaningful ? "Why isn't this meaningful?" : "Why is this value missing?"}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-navy"
        {...triggerProps}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      {/* Always mounted (rather than conditionally rendered) so opacity/transform can
          transition smoothly both in and out, instead of an instant appear/disappear -
          isOpen still fully gates interactivity via pointer-events. */}
      <div
        role="tooltip"
        className={`absolute left-1/2 top-full z-10 mt-2 w-60 -translate-x-1/2 rounded-lg border border-surface-border bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed text-muted shadow-lg transition-all duration-150 ease-out ${
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
        }`}
        {...tooltipProps}
      >
        <p>{notMeaningful ? reason : `Not enough data: ${reason}.`}</p>
        {!notMeaningful &&
          (addMissingHref ? (
            <Link to={addMissingHref} className="mt-2 inline-block font-medium text-coral transition-colors hover:underline">
              Add missing data →
            </Link>
          ) : (
            documentsHref && (
              <Link to={documentsHref} className="mt-2 inline-block font-medium text-coral transition-colors hover:underline">
                Go to Documents →
              </Link>
            )
          ))}
      </div>
    </span>
  );
}

/** Hover/tap affordance showing the exact source document excerpt(s) a
 * confirmed value was extracted from - the audit-trail requirement that
 * every board-report figure must be traceable back to its source (see
 * CLAUDE.md §6). sourceRefs comes from GET .../charts (see
 * lib/dashboardData.findRevenueCardSourceRefs) - only present once a chart
 * config exists for this metric, so cards without one render nothing extra. */
function SourceProvenanceHint({ sourceRefs }: { sourceRefs: SourceRef[] }) {
  const { isOpen, containerRef, triggerProps, tooltipProps } = useHoverPopover();

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="Show source"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-navy"
        {...triggerProps}
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
      </button>
      <div
        role="tooltip"
        className={`absolute left-1/2 top-full z-10 mt-2 w-72 -translate-x-1/2 rounded-lg border border-surface-border bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed text-muted shadow-lg transition-all duration-150 ease-out ${
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
        }`}
        {...tooltipProps}
      >
        <p className="mb-1 font-semibold text-navy">Source</p>
        {sourceRefs.map((ref) => (
          <p key={ref.statement_id} className="mb-1 last:mb-0">
            {ref.source_excerpt ? `"${ref.source_excerpt}"` : "No excerpt recorded"}
            {ref.source_page != null && <span className="text-muted"> (page {ref.source_page})</span>}
          </p>
        ))}
      </div>
    </span>
  );
}

function valueSuffix(unit: string): string {
  if (unit === "ratio") return "x";
  if (unit === "percentage") return "%";
  return "";
}

function deltaSuffix(unit: string): string {
  if (unit === "ratio") return "x";
  if (unit === "percentage") return "pts";
  return "";
}

export function MetricCard({
  label,
  value,
  unit,
  deltaPct,
  deltaDirectionGoodWhenUp = true,
  budget,
  benchmark,
  reason,
  notMeaningful,
  documentsHref,
  addMissingHref,
  sourceRefs,
  note,
}: MetricCardProps) {
  const hasDelta = deltaPct !== undefined;
  const isUp = hasDelta && deltaPct! >= 0;
  const isGood = hasDelta && (deltaDirectionGoodWhenUp ? isUp : !isUp);

  // "Favorable" flips depending on whether higher (revenue) or lower (expenses)
  // is the good direction for this particular line item.
  const isBudgetFavorable =
    budget && budget.variancePct !== null
      ? budget.higherIsBetter
        ? budget.variancePct >= 0
        : budget.variancePct <= 0
      : undefined;

  const isBenchmarkFavorable = benchmark
    ? benchmark.higherIsBetter
      ? benchmark.pointDelta >= 0
      : benchmark.pointDelta <= 0
    : undefined;

  return (
    <div className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
      <p className="text-sm font-medium text-muted">{label}</p>
      {/* A <div>, not a <p>: MissingDataHint/SourceProvenanceHint each render a
       * block-level tooltip <div>, which isn't valid inside a <p> (the browser
       * would silently close the <p> early and reparent it, fighting React's
       * own reconciliation of the same subtree). */}
      <div className="mt-2 flex items-baseline gap-1.5 text-3xl font-semibold tabular-nums text-navy">
        <span>
          {value}
          {unit && <span className="ml-1 text-base font-normal text-muted">{unit}</span>}
        </span>
        {reason && (
          <MissingDataHint
            reason={reason}
            notMeaningful={notMeaningful}
            documentsHref={documentsHref}
            addMissingHref={addMissingHref}
          />
        )}
        {!reason && sourceRefs && sourceRefs.length > 0 && <SourceProvenanceHint sourceRefs={sourceRefs} />}
      </div>
      {hasDelta && (
        <p
          className="mt-1 text-sm font-medium"
          style={{ color: isGood ? "var(--status-good)" : "var(--status-critical)" }}
        >
          {isUp ? "▲" : "▼"} {Math.abs(deltaPct!).toFixed(1)}% vs prior period
        </p>
      )}
      {budget && (
        <p
          className={`mt-1 text-xs font-medium ${ isBudgetFavorable === undefined ? "text-muted " : "" }`}
          style={
            isBudgetFavorable === undefined
              ? undefined
              : { color: isBudgetFavorable ? "var(--status-good)" : "var(--status-critical)" }
          }
        >
          Budget: {formatCurrency(budget.budgetValue, budget.currency)} | Variance:{" "}
          {budget.variancePct !== null
            ? `${budget.variancePct >= 0 ? "+" : ""}${budget.variancePct.toFixed(1)}%`
            : "n/a"}
        </p>
      )}
      {benchmark && (
        <p
          className="mt-1 text-xs font-medium italic"
          style={{ color: isBenchmarkFavorable ? "var(--status-good)" : "var(--status-critical)" }}
        >
          <span
            className="cursor-help underline decoration-dotted"
            title={`Source: ${benchmark.source}${benchmark.periodLabel ? ` (${benchmark.periodLabel})` : ""}`}
          >
            Industry avg: {benchmark.benchmarkValue.toFixed(1)}
            {valueSuffix(benchmark.unit)}
          </span>
          {" | You're "}
          {Math.abs(benchmark.pointDelta).toFixed(1)}
          {deltaSuffix(benchmark.unit)} {benchmark.pointDelta >= 0 ? "above" : "below"}
        </p>
      )}
      {note && <p className="mt-1 text-xs font-medium text-muted">{note}</p>}
    </div>
  );
}
