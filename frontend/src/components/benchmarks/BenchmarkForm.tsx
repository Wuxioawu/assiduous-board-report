import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export const BENCHMARK_METRICS: { key: string; label: string }[] = [
  { key: "gross_margin", label: "Gross Margin" },
  { key: "operating_margin", label: "Operating Margin" },
  { key: "ebitda_margin", label: "EBITDA Margin" },
  { key: "net_margin", label: "Net Margin" },
  { key: "roce", label: "Return on Capital Employed (ROCE)" },
  { key: "dscr", label: "Debt Service Coverage Ratio" },
  { key: "leverage_ratio", label: "Leverage Ratio" },
];

interface BenchmarkFormProps {
  /** Industry/Metric/Period fields - editable inputs on the Create page, a
   * fixed read-only summary on the Edit page. Together these three fields are
   * the benchmark's identity (see backend IndustryBenchmarkRepository.get,
   * keyed on industry+metric_key+period_label) - letting them change mid-edit
   * would upsert a DIFFERENT row instead of updating the one being edited, so
   * Edit locks them rather than leaving them open like Create does. */
  identitySlot: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  source: string;
  onSourceChange: (source: string) => void;
  onSubmit: (event: FormEvent) => void;
  isSaving: boolean;
  error: string | null;
  savedMessage: string | null;
}

/** The benchmark form shared verbatim between BenchmarkCreateView and
 * BenchmarkEditView, mirroring BudgetForm's split between the two Budget
 * pages. */
export function BenchmarkForm({
  identitySlot,
  value,
  onValueChange,
  source,
  onSourceChange,
  onSubmit,
  isSaving,
  error,
  savedMessage,
}: BenchmarkFormProps) {
  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        {identitySlot}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Input
            label="Benchmark Value"
            name="value"
            type="number"
            step="any"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="e.g. 65 (for 65%)"
            required
          />
          <Input
            label="Source"
            name="source"
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
            placeholder="e.g. Industry report XYZ, 2025"
            required
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {savedMessage && <p className="text-sm text-[var(--status-good)]">{savedMessage}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Benchmark"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
