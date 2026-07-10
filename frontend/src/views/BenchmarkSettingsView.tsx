import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteBenchmark, listBenchmarks } from "@/api/benchmarks";
import { getCompany } from "@/api/companies";
import { BENCHMARK_METRICS } from "@/components/benchmarks/BenchmarkForm";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { canManageOrg } from "@/lib/roles";
import type { IndustryBenchmark } from "@/types/benchmark";
import type { Company } from "@/types/company";

export function BenchmarkSettingsView() {
  const { user } = useAuth();
  const canManage = !!user && canManageOrg(user.role);
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [benchmarks, setBenchmarks] = useState<IndustryBenchmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    pendingItem: pendingDelete,
    isDeleting,
    error: deleteError,
    requestDelete,
    cancel: closeDeleteModal,
    confirm: confirmDelete,
  } = useConfirmDelete<IndustryBenchmark>(async (entry) => {
    await deleteBenchmark(entry.id);
    setBenchmarks((prev) => prev.filter((b) => b.id !== entry.id));
  }, "Failed to delete this benchmark, please try again");

  const loadBenchmarks = useCallback(async (forIndustry: string) => {
    if (!forIndustry.trim()) {
      setBenchmarks([]);
      return;
    }
    try {
      const data = await listBenchmarks(forIndustry.trim());
      setBenchmarks(data);
    } catch {
      setLoadError("Failed to load existing benchmarks for this industry");
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    getCompany(companyId)
      .then(async (data) => {
        setCompany(data);
        await loadBenchmarks(data.industry ?? "");
      })
      .catch(() => setCompanyError("Failed to load company"))
      .finally(() => setIsLoading(false));
  }, [companyId, loadBenchmarks]);

  const industry = company?.industry ?? "";

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
          Industry Benchmarks{company ? ` · ${company.name}` : ""}
        </h1>
        {canManage && (
          <Button onClick={() => navigate(`/companies/${companyId}/benchmarks/new`)}>
            <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
            Add Benchmark
          </Button>
        )}
      </div>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Manually-curated peer/industry averages, shown as a comparison alongside a company's own
        actuals on the report views. Organization-wide - shared across every company in the same
        industry.
      </p>

      {companyError && <p className="mb-4 text-sm text-destructive">{companyError}</p>}

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : !industry ? (
        <Card>
          <p className="text-sm text-muted">
            This company has no industry set - add one from the company's Edit form first.
          </p>
        </Card>
      ) : (
        <Card title={`Existing Benchmarks · ${industry}`}>
          {loadError && <p className="mb-3 text-sm text-destructive">{loadError}</p>}
          {benchmarks.length === 0 ? (
            <p className="text-sm text-muted">
              No benchmarks set for this industry yet.
              {canManage ? " Click Add Benchmark to set one." : ""}
            </p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {benchmarks.map((entry) => {
                const metricLabel =
                  BENCHMARK_METRICS.find((m) => m.key === entry.metric_key)?.label ?? entry.metric_key;
                return (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy">
                        {metricLabel} <span className="text-muted">· {entry.period_label}</span>
                      </p>
                      <p className="truncate text-xs text-muted">{entry.source}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold text-navy">{entry.benchmark_value}</span>
                      {canManage && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => navigate(`/companies/${companyId}/benchmarks/${entry.id}/edit`)}
                            className="flex items-center gap-1.5"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => requestDelete(entry)}
                            className="flex items-center gap-1.5"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {pendingDelete && (
        <Modal title="Delete Benchmark" onClose={closeDeleteModal}>
          <div className="mb-4 space-y-2 text-sm text-navy">
            <p>
              Delete the{" "}
              <span className="font-semibold text-navy">
                {BENCHMARK_METRICS.find((m) => m.key === pendingDelete.metric_key)?.label ??
                  pendingDelete.metric_key}{" "}
                · {pendingDelete.period_label}
              </span>{" "}
              benchmark?
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
