import type { ChartConfig } from "@/types/chart";

/** Renders a chart_type="milestone" ChartConfig (see GET .../charts) as a
 * simple chronological list - corporate-action events (acquisitions,
 * listings, funding rounds) read naturally as a timeline of dated entries,
 * not as a plotted chart, so this deliberately isn't a Recharts component
 * like GenericChart. */
export function MilestoneTimeline({ config }: { config: ChartConfig }) {
  const points = [...(config.series[0]?.points ?? [])].sort((a, b) =>
    (a.period_end ?? "").localeCompare(b.period_end ?? ""),
  );

  return (
    <div className="w-full">
      <p className="mb-4 text-base font-semibold text-navy">{config.display_name}</p>
      <ol className="space-y-4 border-l-2 border-surface-border pl-4">
        {points.map((point, i) => (
          <li key={i} className="relative">
            <span
              className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-coral"
              aria-hidden="true"
            />
            <p className="text-xs font-medium text-muted">
              {point.period_end
                ? new Date(point.period_end).toLocaleDateString("en-GB", {
                    day: "numeric", month: "short", year: "numeric",
                  })
                : ""}
            </p>
            <p className="text-sm font-semibold text-navy">{point.step_label}</p>
            {point.description && <p className="text-sm text-muted">{point.description}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
