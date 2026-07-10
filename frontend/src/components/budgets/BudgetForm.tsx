import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export const BUDGET_LINE_ITEMS: { taxonomy_code: string; label: string }[] = [
  { taxonomy_code: "REVENUE", label: "Revenue" },
  { taxonomy_code: "EBITDA", label: "EBITDA" },
  { taxonomy_code: "OPERATING_EXPENSES", label: "Operating Expenses" },
  { taxonomy_code: "NET_INCOME", label: "Net Income" },
];

interface BudgetFormProps {
  /** Period selection UI - an editable dropdown on the Create page, a fixed
   * read-only label on the Edit page (you're editing THIS period's budget,
   * not free to retarget it to a different one mid-edit). */
  periodSlot: ReactNode;
  currency: string;
  formValues: Record<string, string>;
  onFieldChange: (taxonomyCode: string, value: string) => void;
  onSubmit: (event: FormEvent) => void;
  isSaving: boolean;
  disabled?: boolean;
  error: string | null;
  savedMessage: string | null;
}

/** The line-item form shared verbatim between BudgetCreateView and
 * BudgetEditView, so the two never drift apart - mirrors how
 * CompanyProfileFields is shared between Create/Edit Company. */
export function BudgetForm({
  periodSlot,
  currency,
  formValues,
  onFieldChange,
  onSubmit,
  isSaving,
  disabled,
  error,
  savedMessage,
}: BudgetFormProps) {
  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        {periodSlot}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {BUDGET_LINE_ITEMS.map((item) => (
            <Input
              key={item.taxonomy_code}
              label={item.label}
              name={item.taxonomy_code}
              type="number"
              step="any"
              value={formValues[item.taxonomy_code] ?? ""}
              onChange={(e) => onFieldChange(item.taxonomy_code, e.target.value)}
              placeholder={`Target ${item.label.toLowerCase()} (${currency})`}
              disabled={disabled}
            />
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {savedMessage && <p className="text-sm text-[var(--status-good)]">{savedMessage}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving || disabled}>
            {isSaving ? "Saving…" : "Save Budget"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
