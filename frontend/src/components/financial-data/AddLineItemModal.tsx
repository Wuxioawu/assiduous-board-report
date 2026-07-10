import type { FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatPeriodDateRange, formatPeriodOptionLabel, periodKeyOf } from "@/lib/periods";
import type { TaxonomyEntry } from "@/lib/taxonomy";
import type { CompanyPeriod } from "@/types/company";

// Referenced by the submit button's `form` attribute so it can live in the
// modal's sticky footer (outside the <form> element) while still submitting it.
const ADD_LINE_ITEM_FORM_ID = "add-missing-line-item-form";

export function AddLineItemModal({
  periods,
  availableTaxonomyEntries,
  taxonomyCode,
  onTaxonomyCodeChange,
  periodKey,
  onPeriodKeyChange,
  selectedPeriod,
  value,
  onValueChange,
  currency,
  onCurrencyChange,
  sourceNote,
  onSourceNoteChange,
  error,
  isSaving,
  onSubmit,
  onClose,
}: {
  periods: CompanyPeriod[];
  availableTaxonomyEntries: TaxonomyEntry[];
  taxonomyCode: string;
  onTaxonomyCodeChange: (value: string) => void;
  periodKey: string;
  onPeriodKeyChange: (value: string) => void;
  selectedPeriod: CompanyPeriod | undefined;
  value: string;
  onValueChange: (value: string) => void;
  currency: string;
  onCurrencyChange: (value: string) => void;
  sourceNote: string;
  onSourceNoteChange: (value: string) => void;
  error: string | null;
  isSaving: boolean;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Add Missing Line Item"
      onClose={() => (isSaving ? undefined : onClose())}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          {/* form={ADD_LINE_ITEM_FORM_ID}: this button lives outside the <form>
           * element (in the modal's sticky footer, not its scrollable body) but
           * still submits it - the HTML form attribute doesn't require the
           * button to be a DOM descendant of the form it targets. */}
          <Button
            type="submit"
            form={ADD_LINE_ITEM_FORM_ID}
            disabled={isSaving || availableTaxonomyEntries.length === 0}
          >
            {isSaving ? "Adding…" : "Add Line Item"}
          </Button>
        </div>
      }
    >
      <form id={ADD_LINE_ITEM_FORM_ID} onSubmit={onSubmit} className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="add-taxonomy-code" className="text-sm font-medium text-navy">
            Taxonomy Code
          </label>
          {availableTaxonomyEntries.length > 0 ? (
            <select
              id="add-taxonomy-code"
              value={taxonomyCode}
              onChange={(e) => onTaxonomyCodeChange(e.target.value)}
              className="min-h-[44px] rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-coral focus:ring-1 focus:ring-coral"
            >
              <option value="">Select a taxonomy code…</option>
              {availableTaxonomyEntries.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label} ({entry.code})
                </option>
              ))}
            </select>
          ) : (
            // Distinguishes "every standard line item already has a value for this
            // period" (a legitimate, if rare, state) from a bug that silently renders
            // an empty, unexplained dropdown.
            <p className="rounded-md border border-dashed border-surface-border px-3 py-2 text-sm text-muted">
              All standard line items already have data for this period.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="add-period" className="text-sm font-medium text-navy">
            Period
          </label>
          <span className="flex items-baseline gap-1.5">
            <select
              id="add-period"
              value={periodKey}
              onChange={(e) => onPeriodKeyChange(e.target.value)}
              className="min-h-[44px] flex-1 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-coral focus:ring-1 focus:ring-coral"
            >
              {periods.map((period) => (
                <option key={periodKeyOf(period)} value={periodKeyOf(period)}>
                  {formatPeriodOptionLabel(period)}
                </option>
              ))}
            </select>
            {selectedPeriod?.fiscal_label && (
              <span className="whitespace-nowrap text-xs text-muted">
                ({formatPeriodDateRange(selectedPeriod.period_start, selectedPeriod.period_end)})
              </span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Value"
            type="number"
            name="value"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
          />
          <Input
            label="Currency"
            name="currency"
            value={currency}
            maxLength={3}
            onChange={(e) => onCurrencyChange(e.target.value.toUpperCase())}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="add-source-note" className="text-sm font-medium text-navy">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="add-source-note"
            rows={3}
            value={sourceNote}
            onChange={(e) => onSourceNoteChange(e.target.value)}
            placeholder='e.g. "Sourced from management accounts" or "Estimated based on Q3 run-rate"'
            className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </Modal>
  );
}
