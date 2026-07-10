import { useState } from "react";

import { exportReportPdf } from "@/api/export";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import type { Audience } from "@/types/insight";

const SECTION_ORDER: Audience[] = ["management", "board", "equity", "credit"];

const SECTION_LABELS: Record<Audience, string> = {
  management: "Management",
  board: "Board",
  equity: "Equity Investors",
  credit: "Credit Providers",
};

interface ExportModalProps {
  companyId: string;
  initialAudience: Audience;
  period?: string;
  periodLabel?: string;
  onClose: () => void;
}

export function ExportModal({ companyId, initialAudience, period, periodLabel, onClose }: ExportModalProps) {
  const [selected, setSelected] = useState<Set<Audience>>(new Set([initialAudience]));
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSection(section: Audience) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  async function handleGenerate() {
    if (selected.size === 0) return;
    setIsGenerating(true);
    setError(null);
    try {
      const sections = SECTION_ORDER.filter((section) => selected.has(section));
      await exportReportPdf(companyId, sections, period);
      onClose();
    } catch {
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Modal title="Export Report" onClose={onClose}>
      <div className="space-y-4">
        {periodLabel && (
          <p className="text-sm text-muted">
            Period: <span className="font-medium text-navy">{periodLabel}</span>
          </p>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-navy">Sections to include</p>
          <div className="space-y-2">
            {SECTION_ORDER.map((section) => (
              <label key={section} className="flex items-center gap-2 text-sm text-navy">
                <input
                  type="checkbox"
                  checked={selected.has(section)}
                  onChange={() => toggleSection(section)}
                  className="h-4 w-4 rounded border-surface-border text-coral focus:ring-coral"
                />
                {SECTION_LABELS[section]}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || selected.size === 0}>
            {isGenerating ? (
              <>
                <Spinner className="mr-2 h-4 w-4 text-white" />
                Generating…
              </>
            ) : (
              "Generate PDF"
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
