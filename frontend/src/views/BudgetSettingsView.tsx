import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteBudgets, listAllBudgets } from "@/api/budgets";
import { getCompany, getCompanyPeriods } from "@/api/companies";
import { BUDGET_LINE_ITEMS } from "@/components/budgets/BudgetForm";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { formatPeriodDateRange } from "@/lib/periods";
import { canEditData } from "@/lib/roles";
import type { BudgetPeriodSummary } from "@/types/budget";
import type { Company, CompanyPeriod } from "@/types/company";

export function BudgetSettingsView() {
  const { user } = useAuth();
  const canEdit = !!user && canEditData(user.role);
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [periods, setPeriods] = useState<CompanyPeriod[]>([]);
  const [summaries, setSummaries] = useState<BudgetPeriodSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [summariesError, setSummariesError] = useState<string | null>(null);

  const {
    pendingItem: pendingDelete,
    isDeleting,
    error: deleteError,
    requestDelete,
    cancel: closeDeleteModal,
    confirm: confirmDelete,
  } = useConfirmDelete<BudgetPeriodSummary>(async (summary) => {
    if (!companyId) return;
    await deleteBudgets(companyId, summary.period_end);
    setSummaries((prev) => prev.filter((s) => s.period_end !== summary.period_end));
  }, "Failed to delete this budget, please try again");

  const loadSummaries = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await listAllBudgets(companyId);
      setSummaries(data);
    } catch {
      setSummariesError("Failed to load saved budgets");
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([getCompany(companyId), getCompanyPeriods(companyId), loadSummaries()])
      .then(([companyData, periodsData]) => {
        setCompany(companyData);
        setPeriods(periodsData);
      })
      .catch(() => setSummariesError("Failed to load company"))
      .finally(() => setIsLoading(false));
  }, [companyId, loadSummaries]);

  // Fiscal label as primary text with the raw range as smaller muted subtext,
  // matching ReportView/CompanyFinancialDataView - falls back to just the raw
  // range for a period with no computed label.
  function renderSummaryPeriod(summary: BudgetPeriodSummary) {
    const fiscalLabel = periods.find((p) => p.period_end === summary.period_end)?.fiscal_label;
    if (!fiscalLabel) {
      return (
        <>
          {summary.period_start} → {summary.period_end}
        </>
      );
    }
    return (
      <>
        {fiscalLabel}{" "}
        <span className="text-xs text-muted">
          ({formatPeriodDateRange(summary.period_start, summary.period_end)})
        </span>
      </>
    );
  }

  function renderActions(summary: BudgetPeriodSummary) {
    if (!canEdit) return null;
    return (
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => navigate(`/companies/${companyId}/budget/${summary.period_end}/edit`)}
          className="flex items-center gap-1.5"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </Button>
        <Button variant="danger" onClick={() => requestDelete(summary)} className="flex items-center gap-1.5">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
      </div>
    );
  }

  return (
    <AppShell>
      <Link
        to={`/companies/${companyId}`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-navy"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {company?.name ?? "Company"}
      </Link>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">
          Budget{company ? ` · ${company.name}` : ""}
        </h1>
        {canEdit && (
          <Button onClick={() => navigate(`/companies/${companyId}/budget/new`)}>
            <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
            Add Budget
          </Button>
        )}
      </div>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Target values per line item, compared against actuals on the report views.
      </p>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : summariesError ? (
        <p className="text-sm text-destructive">{summariesError}</p>
      ) : summaries.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No budgets set yet.
            {canEdit ? " Click Add Budget to set target values for a period." : ""}
          </p>
        </Card>
      ) : (
        <Card title="Saved Budgets">
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="pb-2 font-medium">Period</th>
                  {BUDGET_LINE_ITEMS.map((item) => (
                    <th key={item.taxonomy_code} className="pb-2 font-medium">
                      {item.label}
                    </th>
                  ))}
                  <th className="pb-2 font-medium">Last Updated</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <tr key={summary.period_end} className="border-t border-surface-border">
                    <td className="whitespace-nowrap py-2 text-navy">{renderSummaryPeriod(summary)}</td>
                    {BUDGET_LINE_ITEMS.map((item) => {
                      const entry = summary.entries.find((e) => e.taxonomy_code === item.taxonomy_code);
                      return (
                        <td key={item.taxonomy_code} className="py-2 text-muted">
                          {entry ? entry.value.toLocaleString() : "—"}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap py-2 text-muted">
                      {new Date(summary.updated_at).toLocaleString()}
                    </td>
                    <td className="py-2">{renderActions(summary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 sm:hidden">
            {summaries.map((summary) => (
              <div key={summary.period_end} className="rounded-lg border border-surface-border p-3">
                <p className="mb-2 text-sm font-medium text-navy">{renderSummaryPeriod(summary)}</p>
                <dl className="mb-2 space-y-1 text-xs text-muted">
                  {BUDGET_LINE_ITEMS.map((item) => {
                    const entry = summary.entries.find((e) => e.taxonomy_code === item.taxonomy_code);
                    return (
                      <div key={item.taxonomy_code}>
                        <dt className="inline font-medium">{item.label}: </dt>
                        <dd className="inline">{entry ? entry.value.toLocaleString() : "—"}</dd>
                      </div>
                    );
                  })}
                  <div>
                    <dt className="inline font-medium">Last Updated: </dt>
                    <dd className="inline">{new Date(summary.updated_at).toLocaleString()}</dd>
                  </div>
                </dl>
                {renderActions(summary)}
              </div>
            ))}
          </div>
        </Card>
      )}

      {pendingDelete && (
        <Modal title="Delete Budget" onClose={closeDeleteModal}>
          <div className="mb-4 space-y-2 text-sm text-navy">
            <p>
              Delete the budget for{" "}
              <span className="font-semibold text-navy">{renderSummaryPeriod(pendingDelete)}</span>?
            </p>
            <p className="text-xs text-muted">This cannot be undone.</p>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDeleteModal} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
