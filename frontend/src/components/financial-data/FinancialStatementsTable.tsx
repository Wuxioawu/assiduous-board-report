import { ExtractedByBadge } from "@/components/financial-data/ExtractedByBadge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatPeriodLabel, periodKeyOf } from "@/lib/periods";
import type { CompanyPeriod } from "@/types/company";
import type { FinancialStatement } from "@/types/financialStatement";

// Only rendered by the caller when the (already-filtered) list is non-empty -
// the "no statements at all" and "no statements match the filters" empty
// states carry different copy/actions and live in the parent view instead.
export function FinancialStatementsTable({
  statements,
  canEdit,
  editingId,
  editValue,
  onEditValueChange,
  onStartEdit,
  onCancelEdit,
  onRequestSaveEdit,
  onViewHistory,
  periodsByKey,
}: {
  statements: FinancialStatement[];
  canEdit: boolean;
  editingId: string | null;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onStartEdit: (statement: FinancialStatement) => void;
  onCancelEdit: () => void;
  onRequestSaveEdit: (statement: FinancialStatement) => void;
  onViewHistory: (statement: FinancialStatement) => void;
  periodsByKey: Map<string, CompanyPeriod>;
}) {
  function renderValueCell(statement: FinancialStatement) {
    if (canEdit && editingId === statement.id) {
      return (
        <input
          type="number"
          className="w-full rounded-lg border border-surface-border bg-white px-2 py-1 text-sm text-navy outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral sm:w-32"
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          autoFocus
        />
      );
    }
    return <>{statement.value.toLocaleString()}</>;
  }

  // formatPeriodLabel's full mode (e.g. "HY2026 (6M to Dec 2025)"), matching
  // every other period display in the app - falls back to the raw range only
  // when this statement's period isn't in periodsByKey at all (shouldn't
  // normally happen, since periods are derived from the same statements).
  function renderPeriodCell(statement: FinancialStatement) {
    const period = periodsByKey.get(periodKeyOf(statement));
    if (!period) {
      return (
        <>
          {statement.period_start} → {statement.period_end}
        </>
      );
    }
    return <>{formatPeriodLabel(period, "full")}</>;
  }

  function renderStatementActions(statement: FinancialStatement) {
    if (canEdit && editingId === statement.id) {
      return (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancelEdit}>
            Cancel
          </Button>
          <Button onClick={() => onRequestSaveEdit(statement)}>Save</Button>
        </div>
      );
    }
    return (
      <div className="flex justify-end gap-2">
        {statement.extracted_by === "manual_override" && (
          <Button variant="secondary" onClick={() => onViewHistory(statement)}>
            History
          </Button>
        )}
        {canEdit && (
          <Button variant="secondary" onClick={() => onStartEdit(statement)}>
            Edit
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      {/* Table for sm and up; a table can't reasonably fit seven columns of
          dense data on a phone width, so narrow screens get a card list
          below instead (same data and actions, just restacked). */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th className="pb-2 font-medium">Taxonomy Code</th>
              <th className="pb-2 font-medium">Value</th>
              <th className="pb-2 font-medium">Currency</th>
              <th className="pb-2 font-medium">Period</th>
              <th className="pb-2 font-medium">Confidence</th>
              <th className="pb-2 font-medium">Source</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {statements.map((statement) => (
              <tr
                key={statement.id}
                className="border-t border-surface-border transition-colors hover:bg-cream/60"
              >
                <td className="py-2 font-mono text-xs text-navy">
                  {statement.taxonomy_code}
                </td>
                <td className="py-2 text-navy">{renderValueCell(statement)}</td>
                <td className="py-2 text-muted">{statement.currency}</td>
                <td className="whitespace-nowrap py-2 text-muted">{renderPeriodCell(statement)}</td>
                <td className="py-2 text-muted">
                  {statement.confidence_score != null
                    ? `${Math.round(statement.confidence_score * 100)}%`
                    : "—"}
                </td>
                <td className="py-2 text-muted">
                  {statement.source_excerpt ? (
                    <span
                      className="cursor-help underline decoration-dotted"
                      title={`${statement.source_excerpt}${
                        statement.source_page ? ` (page ${statement.source_page})` : ""
                      }`}
                    >
                      excerpt
                    </span>
                  ) : (
                    "—"
                  )}
                  <ExtractedByBadge extractedBy={statement.extracted_by} />
                </td>
                <td className="py-2 text-right">{renderStatementActions(statement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 sm:hidden">
        {statements.map((statement) => (
          <div
            key={statement.id}
            className="rounded-lg border border-surface-border p-3"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="font-mono text-xs font-medium text-navy">
                {statement.taxonomy_code}
              </span>
              <ExtractedByBadge extractedBy={statement.extracted_by} />
            </div>
            {canEdit && editingId === statement.id ? (
              <div className="mb-2">{renderValueCell(statement)}</div>
            ) : (
              <p className="mb-2 text-lg font-semibold text-navy">
                {statement.value.toLocaleString()}{" "}
                <span className="text-sm font-normal text-muted">
                  {statement.currency}
                </span>
              </p>
            )}
            <dl className="mb-2 space-y-1 text-xs text-muted">
              <div>
                <dt className="inline font-medium">Period: </dt>
                <dd className="inline">{renderPeriodCell(statement)}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Confidence: </dt>
                <dd className="inline">
                  {statement.confidence_score != null
                    ? `${Math.round(statement.confidence_score * 100)}%`
                    : "—"}
                </dd>
              </div>
              {statement.source_excerpt && (
                <div>
                  <dt className="inline font-medium">Source: </dt>
                  <dd className="inline">
                    <span
                      className="cursor-help underline decoration-dotted"
                      title={`${statement.source_excerpt}${
                        statement.source_page ? ` (page ${statement.source_page})` : ""
                      }`}
                    >
                      excerpt
                    </span>
                  </dd>
                </div>
              )}
            </dl>
            {renderStatementActions(statement)}
          </div>
        ))}
      </div>
    </Card>
  );
}
