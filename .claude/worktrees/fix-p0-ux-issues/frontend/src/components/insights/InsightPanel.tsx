import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Insight, InsightSeverity } from "@/types/insight";

const SEVERITY_STYLES: Record<InsightSeverity, string> = {
  info: "text-[var(--status-good)]",
  warning: "text-[var(--status-warning)]",
  critical: "text-[var(--status-critical)]",
};

interface InsightPanelProps {
  insight: Insight | null;
  onRegenerate: () => Promise<void>;
}

export function InsightPanel({ insight, onRegenerate }: InsightPanelProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    setIsRegenerating(true);
    setError(null);
    try {
      await onRegenerate();
    } catch {
      setError("Failed to regenerate the AI commentary.");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">AI Commentary</h3>
        <Button variant="secondary" onClick={handleRegenerate} disabled={isRegenerating}>
          {isRegenerating ? "Regenerating…" : "Regenerate"}
        </Button>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {insight ? (
        <>
          <p className={`mb-1 text-sm font-semibold ${SEVERITY_STYLES[insight.severity]}`}>{insight.title}</p>
          <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{insight.body}</p>
        </>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">No AI commentary available yet.</p>
      )}
    </Card>
  );
}
