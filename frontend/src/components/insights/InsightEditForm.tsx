import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import type { StructuredInsightContent } from "@/types/insight";

const FIELD_CLASS =
  "w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-coral focus:ring-1 focus:ring-coral";

interface InsightEditFormProps {
  form: StructuredInsightContent;
  onChange: (form: StructuredInsightContent) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  error: string | null;
}

/** Editable form matching StructuredInsightView's read-mode layout. key_stats are
 * deliberately read-only here (shown, not editable) - they stay tied to the
 * underlying computed financials; only the narrative text (headline, each
 * section's summary/detail, watch_items) is human-editable. */
export function InsightEditForm({ form, onChange, onSave, onCancel, isSaving, error }: InsightEditFormProps) {
  function updateSection(index: number, field: "summary" | "detail", value: string) {
    onChange({
      ...form,
      sections: form.sections.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    });
  }

  function updateWatchItem(index: number, value: string) {
    onChange({ ...form, watch_items: form.watch_items.map((w, i) => (i === index ? value : w)) });
  }

  function removeWatchItem(index: number) {
    onChange({ ...form, watch_items: form.watch_items.filter((_, i) => i !== index) });
  }

  function addWatchItem() {
    onChange({ ...form, watch_items: [...form.watch_items, ""] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Headline</label>
        <input
          type="text"
          value={form.headline}
          onChange={(e) => onChange({ ...form, headline: e.target.value })}
          className={FIELD_CLASS}
        />
      </div>

      {form.sections.map((section, index) => (
        <div key={section.label} className="rounded-lg border border-surface-border p-3">
          <p className="mb-2 text-sm font-semibold text-navy">{section.label}</p>

          {section.key_stats.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {section.key_stats.map((stat) => (
                <span
                  key={stat.label}
                  title="Stats stay tied to the underlying financial data and aren't editable here"
                  className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-cream px-2.5 py-1.5 text-xs text-muted"
                >
                  <span className="font-semibold text-navy">{stat.value}</span>
                  {stat.label}
                </span>
              ))}
            </div>
          )}

          <label className="mb-1 block text-xs font-medium text-muted">Summary</label>
          <textarea
            value={section.summary}
            onChange={(e) => updateSection(index, "summary", e.target.value)}
            rows={2}
            className={`mb-3 ${FIELD_CLASS}`}
          />

          <label className="mb-1 block text-xs font-medium text-muted">Detail</label>
          <textarea
            value={section.detail}
            onChange={(e) => updateSection(index, "detail", e.target.value)}
            rows={2}
            className={FIELD_CLASS}
          />
        </div>
      ))}

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Watch Items</label>
        <div className="flex flex-col gap-2">
          {form.watch_items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => updateWatchItem(index, e.target.value)}
                className={`flex-1 ${FIELD_CLASS}`}
              />
              <button
                type="button"
                onClick={() => removeWatchItem(index)}
                aria-label="Remove watch item"
                className="shrink-0 text-destructive/60 transition-colors hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" onClick={addWatchItem} className="mt-2 flex items-center gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Watch Item
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
