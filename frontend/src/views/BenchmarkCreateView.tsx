import { ChevronLeft } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { setBenchmark } from "@/api/benchmarks";
import { getCompany } from "@/api/companies";
import { getErrorDetail } from "@/api/errors";
import { BENCHMARK_METRICS, BenchmarkForm } from "@/components/benchmarks/BenchmarkForm";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { canManageOrg } from "@/lib/roles";
import type { Company } from "@/types/company";

export function BenchmarkCreateView() {
  const { user } = useAuth();
  const canManage = !!user && canManageOrg(user.role);
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [industry, setIndustry] = useState("");
  const [metricKey, setMetricKey] = useState(BENCHMARK_METRICS[0].key);
  const [periodLabel, setPeriodLabel] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    getCompany(companyId)
      .then((data) => {
        setCompany(data);
        setIndustry(data.industry ?? "");
      })
      .catch(() => setCompanyError("Failed to load company"));
  }, [companyId]);

  if (user && !canManage) {
    return <Navigate to={`/companies/${companyId}/benchmarks`} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!industry.trim() || !periodLabel.trim() || !source.trim()) {
      setError("Industry, period, and source are all required");
      return;
    }
    const parsed = Number(value);
    if (value.trim() === "" || Number.isNaN(parsed)) {
      setError("Enter a valid benchmark value");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await setBenchmark({
        industry: industry.trim(),
        metric_key: metricKey,
        period_label: periodLabel.trim(),
        benchmark_value: parsed,
        source: source.trim(),
      });
      navigate(`/companies/${companyId}/benchmarks`);
    } catch (err) {
      setError(getErrorDetail(err, "Failed to save benchmark, please try again"));
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <Link
        to={`/companies/${companyId}/benchmarks`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-navy"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {company?.name ?? "Company"}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-navy">
        Add Benchmark{company ? ` · ${company.name}` : ""}
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Manually-curated peer/industry average, shown as a comparison alongside a company's own
        actuals on the report views. Organization-wide - shared across every company in the same
        industry.
      </p>

      {companyError && <p className="mb-4 text-sm text-destructive">{companyError}</p>}

      <BenchmarkForm
        value={value}
        onValueChange={setValue}
        source={source}
        onSourceChange={setSource}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        error={error}
        savedMessage={null}
        identitySlot={
          <>
            <Input
              label="Industry"
              name="industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Natural Capital / Climate Tech"
              required
            />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="metricKey" className="text-sm font-medium text-navy">
                  Metric
                </label>
                <select
                  id="metricKey"
                  value={metricKey}
                  onChange={(e) => setMetricKey(e.target.value)}
                  className="min-h-[44px] rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-coral focus:ring-1 focus:ring-coral"
                >
                  {BENCHMARK_METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Period"
                name="periodLabel"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder="e.g. 2025 FY"
                required
              />
            </div>
          </>
        }
      />
    </AppShell>
  );
}
