export function IndeterminateProgressBar() {
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border"
    >
      <div className="h-full w-1/4 animate-indeterminate rounded-full bg-coral" />
    </div>
  );
}

/** Real determinate progress (e.g. an upload's tracked byte count) rather than the
 * indeterminate sweep above, which is for waits with no measurable progress. */
export function DeterminateProgressBar({ progress, label }: { progress: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div
      role="progressbar"
      aria-label={label ?? "Uploading"}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border"
    >
      <div
        className="h-full rounded-full bg-coral transition-[width] duration-200 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
