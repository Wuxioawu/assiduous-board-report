import type { MetricCardProps } from "@/types/metrics";

export function MetricCard({
  label,
  value,
  unit,
  deltaPct,
  deltaDirectionGoodWhenUp = true,
}: MetricCardProps) {
  const hasDelta = deltaPct !== undefined;
  const isUp = hasDelta && deltaPct! >= 0;
  const isGood = hasDelta && (deltaDirectionGoodWhenUp ? isUp : !isUp);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">
        {value}
        {unit && <span className="ml-1 text-base font-normal text-slate-500">{unit}</span>}
      </p>
      {hasDelta && (
        <p
          className="mt-1 text-sm font-medium"
          style={{ color: isGood ? "var(--status-good)" : "var(--status-critical)" }}
        >
          {isUp ? "▲" : "▼"} {Math.abs(deltaPct!).toFixed(1)}% 环比
        </p>
      )}
    </div>
  );
}
