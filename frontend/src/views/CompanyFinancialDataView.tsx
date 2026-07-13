import { ChevronLeft, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { getCompany, getCompanyPeriods } from "@/api/companies";
import { getErrorDetail } from "@/api/errors";
import {
  createFinancialStatement,
  getFinancialStatementHistory,
  listFinancialStatements,
  updateFinancialStatement,
} from "@/api/financialStatements";
import { AddLineItemModal } from "@/components/financial-data/AddLineItemModal";
import { FinancialDataFilters, type SourceFilter } from "@/components/financial-data/FinancialDataFilters";
import { FinancialStatementsTable } from "@/components/financial-data/FinancialStatementsTable";
import { HistoryModal } from "@/components/financial-data/HistoryModal";
import { OverrideConfirmModal } from "@/components/financial-data/OverrideConfirmModal";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { periodKeyOf } from "@/lib/periods";
import { canEditData } from "@/lib/roles";
import { TAXONOMY_ENTRIES } from "@/lib/taxonomy";
import type { Company, CompanyPeriod } from "@/types/company";
import type { FinancialStatement, FinancialStatementHistoryEntry } from "@/types/financialStatement";

export function CompanyFinancialDataView() {
  const { user } = useAuth();
  const canEdit = !!user && canEditData(user.role);
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [periods, setPeriods] = useState<CompanyPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pendingOverride, setPendingOverride] = useState<{ statement: FinancialStatement; newValue: number } | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [historyStatement, setHistoryStatement] = useState<FinancialStatement | null>(null);
  const [historyEntries, setHistoryEntries] = useState<FinancialStatementHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  // Debounced so fast typing doesn't refilter (and re-render the whole table) on every
  // keystroke - only the case-insensitive comparison value lags briefly, not the input.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchInput.trim().toLowerCase()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addTaxonomyCode, setAddTaxonomyCode] = useState("");
  const [addValue, setAddValue] = useState("");
  const [addCurrency, setAddCurrency] = useState("");
  const [addPeriodKey, setAddPeriodKey] = useState("");
  const [addSourceNote, setAddSourceNote] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAddSaving, setIsAddSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const statementsData = await listFinancialStatements(companyId);
    setStatements(statementsData);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    getCompany(companyId)
      .then(setCompany)
      .catch(() => setError("Failed to load company"));
    // Periods come from the same GET /companies/{id}/periods endpoint ReportView
    // and BudgetSettingsView use (fiscal_label included) - loaded alongside
    // statements rather than re-derived locally, so the period pickers here
    // never drift out of sync with the fiscal-label system again.
    Promise.all([refresh(), getCompanyPeriods(companyId).then(setPeriods)])
      .catch(() => setError("Failed to load financial statements"))
      .finally(() => setIsLoading(false));
  }, [companyId, refresh]);

  function startEdit(statement: FinancialStatement) {
    setEditingId(statement.id);
    setEditValue(String(statement.value));
  }

  function requestSaveEdit(statement: FinancialStatement) {
    const trimmed = editValue.trim();
    const parsed = Number(trimmed);
    if (trimmed === "" || Number.isNaN(parsed)) {
      setError("Enter a valid number");
      return;
    }
    setError(null);
    setPendingOverride({ statement, newValue: parsed });
  }

  async function confirmOverride() {
    if (!pendingOverride) return;
    setIsSaving(true);
    try {
      const updated = await updateFinancialStatement(pendingOverride.statement.id, pendingOverride.newValue);
      setStatements((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingId(null);
      setPendingOverride(null);
    } catch {
      setError("Failed to save the corrected value");
      setPendingOverride(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function viewHistory(statement: FinancialStatement) {
    setHistoryStatement(statement);
    setHistoryEntries(null);
    setHistoryError(null);
    try {
      const entries = await getFinancialStatementHistory(statement.id);
      setHistoryEntries(entries);
    } catch {
      setHistoryError("Failed to load override history");
    }
  }

  const selectedFilterPeriod = periods.find((p) => periodKeyOf(p) === periodFilter);
  // Looks up each statement's fiscal label for the table's Period column - a
  // FinancialStatement itself doesn't carry one, only the periods fetched from
  // GET /companies/{id}/periods do.
  const periodsByKey = useMemo(() => new Map(periods.map((p) => [periodKeyOf(p), p])), [periods]);

  const hasActiveFilters = searchInput.trim() !== "" || periodFilter !== "all" || sourceFilter !== "all";

  function clearFilters() {
    setSearchInput("");
    setDebouncedSearch("");
    setPeriodFilter("all");
    setSourceFilter("all");
  }

  const filteredStatements = useMemo(() => {
    return statements.filter((s) => {
      if (periodFilter !== "all" && periodKeyOf(s) !== periodFilter) return false;
      if (sourceFilter !== "all" && s.extracted_by !== sourceFilter) return false;
      if (debouncedSearch) {
        const haystack = `${s.taxonomy_code} ${s.source_excerpt ?? ""}`.toLowerCase();
        if (!haystack.includes(debouncedSearch)) return false;
      }
      return true;
    });
  }, [statements, periodFilter, sourceFilter, debouncedSearch]);

  const selectedAddPeriod = periods.find((p) => periodKeyOf(p) === addPeriodKey);
  // Memoized so typing in the Add-Line-Item form's Value/Note fields (state
  // that lives in this same component) doesn't recompute this on every
  // keystroke - only when the period, the taxonomy list, or the selected
  // code actually change.
  const availableTaxonomyEntries = useMemo(() => {
    const codesPresentForAddPeriod = new Set(
      statements.filter((s) => periodKeyOf(s) === addPeriodKey).map((s) => s.taxonomy_code),
    );
    return TAXONOMY_ENTRIES.filter(
      (entry) => entry.code === addTaxonomyCode || !codesPresentForAddPeriod.has(entry.code),
    );
  }, [statements, addPeriodKey, addTaxonomyCode]);

  function openAddModal(prefill?: { taxonomyCode?: string; periodKey?: string }) {
    setAddError(null);
    setAddValue("");
    setAddSourceNote("");
    setAddCurrency(company?.currency ?? "");
    setAddPeriodKey(prefill?.periodKey ?? (periods[0] ? periodKeyOf(periods[0]) : ""));
    setAddTaxonomyCode(prefill?.taxonomyCode ?? "");
    setIsAddModalOpen(true);
  }

  // Deep-linked from the Report view's "why is this missing" tooltip (see MetricCard's
  // MissingDataHint), which sends the exact taxonomy code and period responsible so this
  // form opens pre-filled instead of making the user hunt for both again.
  useEffect(() => {
    if (isLoading || !canEdit) return;
    const taxonomyCode = searchParams.get("addTaxonomyCode");
    const periodStart = searchParams.get("addPeriodStart");
    const periodEnd = searchParams.get("addPeriodEnd");
    if (!taxonomyCode && !periodStart && !periodEnd) return;
    openAddModal({
      taxonomyCode: taxonomyCode ?? undefined,
      periodKey: periodStart && periodEnd ? `${periodStart}|${periodEnd}` : undefined,
    });
    const next = new URLSearchParams(searchParams);
    next.delete("addTaxonomyCode");
    next.delete("addPeriodStart");
    next.delete("addPeriodEnd");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, canEdit]);

  async function handleAddSubmit(event: FormEvent) {
    event.preventDefault();
    if (!companyId) return;
    const [periodStart, periodEnd] = addPeriodKey.split("|");
    const trimmedValue = addValue.trim();
    const parsedValue = Number(trimmedValue);
    if (!addTaxonomyCode) {
      setAddError("Choose a taxonomy code");
      return;
    }
    if (!periodStart || !periodEnd) {
      setAddError("Choose a period");
      return;
    }
    if (trimmedValue === "" || Number.isNaN(parsedValue)) {
      setAddError("Enter a valid number");
      return;
    }
    if (!addCurrency.trim()) {
      setAddError("Enter a currency code");
      return;
    }

    setAddError(null);
    setIsAddSaving(true);
    try {
      const created = await createFinancialStatement(companyId, {
        taxonomy_code: addTaxonomyCode,
        value: parsedValue,
        currency: addCurrency.trim().toUpperCase(),
        period_start: periodStart,
        period_end: periodEnd,
        source_note: addSourceNote.trim() || null,
      });
      setStatements((prev) => [created, ...prev]);
      setIsAddModalOpen(false);
    } catch (err) {
      setAddError(getErrorDetail(err, "Failed to add the line item"));
    } finally {
      setIsAddSaving(false);
    }
  }

  return (
    <AppShell>
      <Link
        to={`/companies/${companyId}/documents`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-navy"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Documents
      </Link>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">
          Financial Data{company ? ` · ${company.name}` : ""}
        </h1>
        {canEdit && (
          <Button variant="secondary" onClick={() => openAddModal()}>
            <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
            Add Missing Line Item
          </Button>
        )}
      </div>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Every line item extracted from documents, plus manual additions and corrections.
      </p>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : statements.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No financial data extracted yet. Upload a document from the Ingestion page to get started.
          </p>
        </Card>
      ) : (
        <>
          <FinancialDataFilters
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            periods={periods}
            periodFilter={periodFilter}
            onPeriodFilterChange={setPeriodFilter}
            selectedFilterPeriod={selectedFilterPeriod}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
            filteredCount={filteredStatements.length}
            totalCount={statements.length}
          />

          {filteredStatements.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-muted">No line items match your filters.</p>
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            </Card>
          ) : (
            <FinancialStatementsTable
              statements={filteredStatements}
              canEdit={canEdit}
              editingId={editingId}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onStartEdit={startEdit}
              onCancelEdit={() => setEditingId(null)}
              onRequestSaveEdit={requestSaveEdit}
              onViewHistory={viewHistory}
              periodsByKey={periodsByKey}
            />
          )}
        </>
      )}

      {pendingOverride && (
        <OverrideConfirmModal
          pendingOverride={pendingOverride}
          isSaving={isSaving}
          onCancel={() => setPendingOverride(null)}
          onConfirm={confirmOverride}
        />
      )}

      {isAddModalOpen && (
        <AddLineItemModal
          periods={periods}
          availableTaxonomyEntries={availableTaxonomyEntries}
          taxonomyCode={addTaxonomyCode}
          onTaxonomyCodeChange={setAddTaxonomyCode}
          periodKey={addPeriodKey}
          onPeriodKeyChange={setAddPeriodKey}
          selectedPeriod={selectedAddPeriod}
          value={addValue}
          onValueChange={setAddValue}
          currency={addCurrency}
          onCurrencyChange={setAddCurrency}
          sourceNote={addSourceNote}
          onSourceNoteChange={setAddSourceNote}
          error={addError}
          isSaving={isAddSaving}
          onSubmit={handleAddSubmit}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}

      {historyStatement && (
        <HistoryModal
          statement={historyStatement}
          entries={historyEntries}
          error={historyError}
          onClose={() => setHistoryStatement(null)}
        />
      )}
    </AppShell>
  );
}
