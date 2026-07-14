import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { listBudgets, setBudgets } from "@/api/budgets";
import { getCompany, getCompanyPeriods } from "@/api/companies";
import { getErrorDetail } from "@/api/errors";
import { BUDGET_LINE_ITEMS, BudgetForm } from "@/components/budgets/BudgetForm";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { formatPeriodLabel } from "@/lib/periods";
import { canEditData } from "@/lib/roles";
import type { BudgetEntryInput } from "@/types/budget";
import type { Company, CompanyPeriod } from "@/types/company";

export function BudgetEditView() {
  const { user } = useAuth();
  const canEdit = !!user && canEditData(user.role);
  const { companyId, period } = useParams<{ companyId: string; period: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [periods, setPeriods] = useState<CompanyPeriod[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadBudgetValues = useCallback(async () => {
    if (!companyId || !period) return;
    const entries = await listBudgets(companyId, period);
    const next: Record<string, string> = {};
    for (const item of BUDGET_LINE_ITEMS) {
      const existing = entries.find((e) => e.taxonomy_code === item.taxonomy_code);
      next[item.taxonomy_code] = existing ? String(existing.value) : "";
    }
    setFormValues(next);
  }, [companyId, period]);

  useEffect(() => {
    if (!companyId || !period) return;
    Promise.all([getCompany(companyId), getCompanyPeriods(companyId), loadBudgetValues()])
      .then(([companyData, periodsData]) => {
        setCompany(companyData);
        setPeriods(periodsData);
        if (!periodsData.some((p) => p.period_end === period)) {
          setLoadError("This budget period no longer exists.");
        }
      })
      .catch(() => setLoadError("Failed to load this budget"))
      .finally(() => setIsLoading(false));
  }, [companyId, period, loadBudgetValues]);

  if (user && !canEdit) {
    return <Navigate to={`/companies/${companyId}/budget`} replace />;
  }

  function handleFieldChange(taxonomyCode: string, value: string) {
    setFormValues((prev) => ({ ...prev, [taxonomyCode]: value }));
  }

  const periodEntry = periods.find((p) => p.period_end === period);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!companyId || !company || !periodEntry) return;

    const entries: BudgetEntryInput[] = [];
    for (const item of BUDGET_LINE_ITEMS) {
      const raw = formValues[item.taxonomy_code]?.trim();
      if (!raw) continue;
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        setError(`Enter a valid number for ${item.label}`);
        return;
      }
      entries.push({ taxonomy_code: item.taxonomy_code, value: parsed, currency: company.currency });
    }

    if (entries.length === 0) {
      setError("Enter at least one budget value before saving");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await setBudgets(companyId, periodEntry.period_start, periodEntry.period_end, entries);
      navigate(`/companies/${companyId}/budget`);
    } catch (err) {
      setError(getErrorDetail(err, "Failed to save budget, please try again"));
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <Link
        to={`/companies/${companyId}/budget`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-navy"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Budget
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-navy">
        Edit Budget{company ? ` · ${company.name}` : ""}
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Update target values for this period - they're compared against actuals on the report views.
      </p>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <BudgetForm
          currency={company?.currency ?? "USD"}
          formValues={formValues}
          onFieldChange={handleFieldChange}
          onSubmit={handleSubmit}
          isSaving={isSaving}
          error={error}
          savedMessage={null}
          periodSlot={
            <div className="flex items-center gap-2 text-sm text-muted">
              Period
              <span className="font-medium text-navy">
                {periodEntry ? formatPeriodLabel(periodEntry, "full") : period}
              </span>
            </div>
          }
        />
      )}
    </AppShell>
  );
}
