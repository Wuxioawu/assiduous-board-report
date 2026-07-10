import { AlertTriangle, Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import type { InsightSeverity, KeyStat, StatTrend, StructuredInsightContent } from "@/types/insight";

const SEVERITY_STYLES: Record<InsightSeverity, string> = {
  info: "text-[var(--status-good)]",
  warning: "text-[var(--status-warning)]",
  critical: "text-[var(--status-critical)]",
};

const TREND_ICONS: Record<StatTrend, LucideIcon> = {
  up: TrendingUp,
  down: TrendingDown,
  neutral: Minus,
};

const TREND_COLORS: Record<StatTrend, string> = {
  up: "text-[var(--status-good)]",
  down: "text-[var(--status-critical)]",
  neutral: "text-muted",
};

function StatChip({ stat }: { stat: KeyStat }) {
  const TrendIcon = TREND_ICONS[stat.trend];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-cream px-2.5 py-1.5 text-xs">
      <TrendIcon className={`h-3.5 w-3.5 shrink-0 ${TREND_COLORS[stat.trend]}`} aria-hidden="true" />
      <span className="font-semibold text-navy">{stat.value}</span>
      <span className="text-muted">{stat.label}</span>
      {stat.note && <span className="text-muted">· {stat.note}</span>}
    </span>
  );
}

interface StructuredInsightViewProps {
  content: StructuredInsightContent;
  severity: InsightSeverity;
}

/** Scannable structured rendering of an AI insight: bold verdict headline, then
 * label → stat-chips → short detail per section (deliberately not rendering
 * `section.summary` here - it's kept in the data for API completeness, but
 * showing it alongside `detail` would reintroduce the dense-paragraph feel this
 * layout replaces), then a visually separated watch-items box. */
export function StructuredInsightView({ content, severity }: StructuredInsightViewProps) {
  return (
    <div>
      <p className={`text-base font-bold leading-snug ${SEVERITY_STYLES[severity]}`}>{content.headline}</p>

      <div className="mt-4 flex flex-col divide-y divide-surface-border">
        {content.sections.map((section) => (
          <div key={section.label} className="py-3 first:pt-0 last:pb-0">
            <p className="mb-2 text-sm font-semibold text-navy">{section.label}</p>
            {section.key_stats.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {section.key_stats.map((stat) => (
                  <StatChip key={stat.label} stat={stat} />
                ))}
              </div>
            )}
            <p className="text-sm leading-relaxed text-muted">{section.detail}</p>
          </div>
        ))}
      </div>

      {content.watch_items.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">Watch Items</p>
          <ul className="space-y-1.5">
            {content.watch_items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
