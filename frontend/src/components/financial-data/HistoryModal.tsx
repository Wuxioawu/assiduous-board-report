import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import type { FinancialStatement, FinancialStatementHistoryEntry } from "@/types/financialStatement";

export function HistoryModal({
  statement,
  entries,
  error,
  onClose,
}: {
  statement: FinancialStatement;
  entries: FinancialStatementHistoryEntry[] | null;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Override History"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-muted">
        <span className="font-mono">{statement.taxonomy_code}</span>
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && entries === null && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      )}
      {entries && entries.length === 0 && (
        <p className="text-sm text-muted">No manual overrides recorded.</p>
      )}
      {entries && entries.length > 0 && (
        <ul className="space-y-2 text-sm text-navy">
          {entries.map((entry) => (
            <li key={entry.id} className="border-b border-surface-border pb-2 last:border-0">
              <span className="text-[var(--status-good)]">AI: {entry.previous_value.toLocaleString()}</span>
              {" → "}
              <span className="font-medium text-[var(--status-warning)]">
                Manual: {entry.new_value.toLocaleString()}
              </span>
              <span className="ml-2 text-xs text-muted">
                {new Date(entry.changed_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
