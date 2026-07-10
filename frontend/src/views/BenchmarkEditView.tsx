import { ChevronLeft } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { listBenchmarks, setBenchmark } from "@/api/benchmarks";
import { getCompany } from "@/api/companies";
import { getErrorDetail } from "@/api/errors";
import { BENCHMARK_METRICS, BenchmarkForm } from "@/components/benchmarks/BenchmarkForm";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { canManageOrg } from "@/lib/roles";
import type { IndustryBenchmark } from "@/types/benchmark";
import type { Company } from "@/types/company";

export function BenchmarkEditView() {
  const { user } = useAuth();
  const canManage = !!user && canManageOrg(user.role);
  const { companyId, id } = useParams<{ companyId: string; id: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [entry, setEntry] = useState<IndustryBenchmark | null>(null);
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !id) return;
    getCompany(companyId)
      .then(async (companyData) => {
        setCompany(companyData);
        if (!companyData.industry) {
          setLoadError("This company has no industry set.");
          return;
        }
        const entries = await listBenchmarks(companyData.industry);
        const found = entries.find((e) => e.id === id);
        if (!found) {
          setLoadError("This benchmark no longer exists.");
          return;
        }
        setEntry(found);
        setValue(String(found.benchmark_value));
        setSource(found.source);
      })
      .catch(() => setLoadError("Failed to load this benchmark"))
      .finally(() => setIsLoading(false));
  }, [companyId, id]);

  if (user && !canManage) {
    return <Navigate to={`/companies/${companyId}/benchmarks`} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entry) return;
    if (!source.trim()) {
      setError("Source is required");
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
      // Same industry/metric_key/period_label as the entry being edited - this
      // upserts (updates) the existing row rather than creating a new one, see
      // BenchmarkForm's identitySlot doc comment.
      await setBenchmark({
        industry: entry.industry,
        metric_key: entry.metric_key,
        period_label: entry.period_label,
        benchmark_value: parsed,
        source: source.trim(),
      });
      navigate(`/companies/${companyId}/benchmarks`);
    } catch (err) {
      setError(getErrorDetail(err, "Failed to save benchmark, please try again"));
      setIsSaving(false);
    }
  }

  const metricLabel = entry
    ? (BENCHMARK_METRICS.find((m) => m.key === entry.metric_key)?.label ?? entry.metric_key)
    : "";

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
        Edit Benchmark{company ? ` · ${company.name}` : ""}
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Update the value or source for this benchmark entry.
      </p>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : entry ? (
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
            <div className="rounded-lg border border-surface-border bg-cream/60 px-4 py-3">
              <p className="text-sm font-medium text-navy">
                {metricLabel} <span className="text-muted">· {entry.period_label}</span>
              </p>
              <p className="text-xs text-muted">Industry: {entry.industry}</p>
            </div>
          }
        />
      ) : null}
    </AppShell>
  );
}
