import { ChevronLeft } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { setBudgets } from "@/api/budgets";
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

export function BudgetCreateView() {
  const { user } = useAuth();
  const canEdit = !!user && canEditData(user.role);
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [periods, setPeriods] = useState<CompanyPeriod[]>([]);
  const [selectedPeriodEnd, setSelectedPeriodEnd] = useState<string | undefined>(undefined);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([getCompany(companyId), getCompanyPeriods(companyId)])
      .then(([companyData, periodsData]) => {
        setCompany(companyData);
        setPeriods(periodsData);
        setSelectedPeriodEnd(periodsData[0]?.period_end);
      })
      .catch(() => setError("Failed to load company"))
      .finally(() => setIsLoading(false));
  }, [companyId]);

  if (user && !canEdit) {
    return <Navigate to={`/companies/${companyId}/budget`} replace />;
  }

  function handleFieldChange(taxonomyCode: string, value: string) {
    setFormValues((prev) => ({ ...prev, [taxonomyCode]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!companyId || !company) return;
    const selectedPeriod = periods.find((p) => p.period_end === selectedPeriodEnd);
    if (!selectedPeriod) {
      setError("Select a period before saving");
      return;
    }

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
      await setBudgets(companyId, selectedPeriod.period_start, selectedPeriod.period_end, entries);
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
        Add Budget{company ? ` · ${company.name}` : ""}
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Set target values per line item to compare against actuals on the report views.
      </p>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : periods.length === 0 ? (
        <p className="text-sm text-muted">No reporting periods yet - upload a document for this company first.</p>
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
            <label className="flex items-center gap-2 text-sm text-muted">
              Period
              <select
                value={selectedPeriodEnd ?? ""}
                onChange={(e) => setSelectedPeriodEnd(e.target.value)}
                className="rounded-lg border border-surface-border bg-white px-2 py-1 text-sm font-medium text-navy outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral"
              >
                {periods.map((p) => (
                  <option key={p.period_end} value={p.period_end}>
                    {formatPeriodLabel(p, "compact")}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      )}
    </AppShell>
  );
}
