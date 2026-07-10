import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { FinancialStatement } from "@/types/financialStatement";

export function OverrideConfirmModal({
  pendingOverride,
  isSaving,
  onCancel,
  onConfirm,
}: {
  pendingOverride: { statement: FinancialStatement; newValue: number };
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Confirm Override" onClose={() => (isSaving ? undefined : onCancel())}>
      <div className="mb-4 space-y-2 text-sm text-navy">
        <p>
          <span className="font-medium text-muted">Taxonomy code:</span>{" "}
          <span className="font-mono">{pendingOverride.statement.taxonomy_code}</span>
        </p>
        <p>
          <span className="font-medium text-muted">
            {pendingOverride.statement.extracted_by === "manual_override"
              ? "Current value:"
              : "AI-extracted value:"}
          </span>{" "}
          {pendingOverride.statement.value.toLocaleString()}
          {pendingOverride.statement.confidence_score != null && (
            <span className="ml-1 text-muted">
              ({Math.round(pendingOverride.statement.confidence_score * 100)}% confidence)
            </span>
          )}
        </p>
        <p>
          <span className="font-medium text-muted">New value:</span>{" "}
          <span className="font-semibold text-navy">
            {pendingOverride.newValue.toLocaleString()}
          </span>
        </p>
        <p className="text-xs text-muted">
          This will overwrite the extracted figure and record the change in the audit log.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={isSaving}>
          {isSaving ? "Saving…" : "Confirm Override"}
        </Button>
      </div>
    </Modal>
  );
}
