import { BarChart3 } from "lucide-react";

interface ChartEmptyStateProps {
  message: string;
}

/** Consistent "not enough data" placeholder for a chart - same footprint
 * (h-80) as a populated chart so the layout doesn't jump once data becomes
 * available, and the same icon+message language MetricCard's missing-data
 * hint uses elsewhere, instead of each chart falling back to its own
 * unstyled plain text. */
export function ChartEmptyState({ message }: ChartEmptyStateProps) {
  return (
    <div className="flex h-80 w-full flex-col items-center justify-center gap-2 text-center">
      <BarChart3 className="h-8 w-8 text-muted/50" aria-hidden="true" />
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
