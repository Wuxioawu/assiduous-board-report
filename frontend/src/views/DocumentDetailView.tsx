import { ChevronLeft, FileText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { generateAccuracyReport, getDocument, getLatestAccuracyReport, reExtractDocument } from "@/api/documents";
import { getErrorDetail } from "@/api/errors";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { canEditData, canManageOrg } from "@/lib/roles";
import type { AccuracyReport } from "@/types/accuracyReport";
import { IN_PROGRESS_DOCUMENT_STATUSES, type CompanyDocument, type DocumentStatus } from "@/types/document";

const POLL_INTERVAL_MS = 3000;

const STATUS_STYLES: Record<DocumentStatus, string> = {
  pending: "text-muted",
  processing: "text-[var(--status-warning)]",
  extracted: "text-[var(--status-good)]",
  failed: "text-[var(--status-critical)]",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  extracted: "Extracted",
  failed: "Failed",
};

function ScorecardSummary({ report }: { report: AccuracyReport }) {
  const { scorecard } = report;
  const parts = [
    scorecard.ground_truth_available
      ? `${scorecard.exact_matches}/${scorecard.fields_compared} fields exact match`
      : "No ground-truth fixture for this document",
    `${scorecard.identity_checks_passed}/${scorecard.identity_checks_total} accounting identities passed`,
    `pipeline ${report.pipeline_version}`,
  ];
  const isClean =
    scorecard.mismatches.length === 0 && scorecard.identity_checks_passed === scorecard.identity_checks_total;
  return (
    <p
      className="text-sm font-medium"
      style={{ color: isClean ? "var(--status-good)" : "var(--status-critical)" }}
    >
      {parts.join(" · ")}
    </p>
  );
}

function MismatchRow({ mismatch }: { mismatch: AccuracyReport["scorecard"]["mismatches"][number] }) {
  const [showExcerpt, setShowExcerpt] = useState(false);
  return (
    <>
      <tr className="border-t border-surface-border">
        <td className="py-2 text-muted">{mismatch.period_label}</td>
        <td className="py-2 font-mono text-xs text-navy">{mismatch.field}</td>
        <td className="py-2 text-navy">{mismatch.expected.toLocaleString()}</td>
        <td className="py-2 text-destructive">{mismatch.got !== null ? mismatch.got.toLocaleString() : "— (not extracted)"}</td>
        <td className="py-2 text-right">
          <button
            type="button"
            onClick={() => setShowExcerpt((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-coral transition-colors hover:underline"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {showExcerpt ? "Hide source" : "View source"}
          </button>
        </td>
      </tr>
      {showExcerpt && (
        <tr className="border-t border-surface-border bg-cream/40">
          <td colSpan={5} className="py-2 text-xs text-muted">
            {mismatch.source_excerpt ? (
              <>
                "{mismatch.source_excerpt}"
                {mismatch.source_page != null && <span> (page {mismatch.source_page})</span>}
              </>
            ) : (
              "No source excerpt recorded for this field."
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function AccuracyPanel({
  companyId,
  documentId,
  documentStatus,
}: {
  companyId: string;
  documentId: string;
  // Included so a status flip (e.g. processing -> extracted, after this
  // page's own Re-extract) re-fetches the latest report - the backend
  // auto-generates a fresh one as soon as a re-extraction completes (see
  // services/extraction/pipeline.run_extraction's generate_accuracy_report),
  // so this panel should never keep showing a stale pre-re-extract scorecard.
  documentStatus: DocumentStatus;
}) {
  const [report, setReport] = useState<AccuracyReport | null | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getLatestAccuracyReport(companyId, documentId)
      .then(setReport)
      .catch(() => setError("Failed to load the accuracy report"));
  }, [companyId, documentId]);

  useEffect(() => {
    refresh();
  }, [refresh, documentStatus]);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const fresh = await generateAccuracyReport(companyId, documentId);
      setReport(fresh);
    } catch (err) {
      setError(getErrorDetail(err, "Failed to generate the accuracy report"));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card title="Accuracy" className="mb-6">
      <p className="mb-4 text-sm leading-relaxed text-muted">
        Compares this document's currently-extracted values against a hand-verified ground-truth fixture (when
        one exists) and against the accounting-identity checks - the same numbers a board would be shown, made
        provable.
      </p>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {report === undefined ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : report === null ? (
        <p className="mb-3 text-sm text-muted">No accuracy report has been run for this document yet.</p>
      ) : (
        <div className="mb-4">
          <ScorecardSummary report={report} />
          <p className="mt-1 text-xs text-muted">
            Last run {new Date(report.created_at).toLocaleString()}
          </p>
        </div>
      )}

      <Button variant="secondary" onClick={handleGenerate} disabled={isGenerating} className="mb-4">
        {isGenerating ? "Running…" : report ? "Re-run Accuracy Report" : "Run Accuracy Report"}
      </Button>

      {report && report.scorecard.mismatches.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="pb-2 font-medium">Period</th>
                <th className="pb-2 font-medium">Field</th>
                <th className="pb-2 font-medium">Expected</th>
                <th className="pb-2 font-medium">Got</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {report.scorecard.mismatches.map((mismatch, i) => (
                <MismatchRow key={`${mismatch.period_label}-${mismatch.field}-${i}`} mismatch={mismatch} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function DocumentDetailView() {
  const { user } = useAuth();
  const canReExtract = !!user && canEditData(user.role);
  const canSeeAccuracy = !!user && canManageOrg(user.role);
  const { companyId, documentId } = useParams<{ companyId: string; documentId: string }>();

  const [document, setDocument] = useState<CompanyDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [reExtractError, setReExtractError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!companyId || !documentId) return Promise.resolve();
    return getDocument(companyId, documentId)
      .then(setDocument)
      .catch(() => setError("Failed to load document"));
  }, [companyId, documentId]);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  // Polls while extraction is in progress (right after upload, or after this
  // page's own Re-extract) so status/the Accuracy panel below pick up the
  // finished result without a manual reload.
  useEffect(() => {
    if (!document || !IN_PROGRESS_DOCUMENT_STATUSES.includes(document.status)) return;
    const interval = setInterval(() => refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [document, refresh]);

  async function handleReExtract() {
    if (!companyId || !documentId) return;
    setIsReExtracting(true);
    setReExtractError(null);
    try {
      const updated = await reExtractDocument(companyId, documentId);
      setDocument(updated);
    } catch (err) {
      setReExtractError(getErrorDetail(err, "Failed to re-extract this document"));
    } finally {
      setIsReExtracting(false);
    }
  }

  const isProcessing = !!document && IN_PROGRESS_DOCUMENT_STATUSES.includes(document.status);

  return (
    <AppShell>
      <Link
        to={`/companies/${companyId}/documents/ingestion`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-navy"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Document Ingestion
      </Link>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !document ? (
        <p className="text-sm text-destructive">Document not found</p>
      ) : (
        <>
          <h1 className="mb-1 break-words text-2xl font-bold text-navy">{document.filename}</h1>
          <p className={`mb-6 text-sm font-medium ${STATUS_STYLES[document.status]}`}>
            {STATUS_LABELS[document.status]}
            {isProcessing && <Spinner className="ml-2 inline h-3.5 w-3.5" />}
            {document.status === "failed" && document.error_message && (
              <span className="ml-2 text-xs font-normal text-muted">{document.error_message}</span>
            )}
          </p>

          <Card className="mb-6">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-muted">Source</dt>
                <dd className="text-navy">{document.source_type === "auto_fetched" ? "Auto-fetched" : "Manual upload"}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted">Uploaded</dt>
                <dd className="text-navy">{new Date(document.created_at).toLocaleString()}</dd>
              </div>
            </dl>

            {canReExtract && (
              <div className="mt-4 border-t border-surface-border pt-4">
                <Button
                  variant="secondary"
                  onClick={handleReExtract}
                  disabled={isReExtracting || isProcessing}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {isReExtracting || isProcessing ? "Extracting…" : "Re-extract"}
                </Button>
                <p className="mt-2 text-xs text-muted">
                  Re-runs extraction against this same file - all previously-extracted line items for it are
                  replaced, and the Accuracy report below refreshes automatically once it completes.
                </p>
                {reExtractError && <p className="mt-2 text-sm text-destructive">{reExtractError}</p>}
              </div>
            )}
          </Card>

          {canSeeAccuracy && companyId && documentId && (
            <AccuracyPanel companyId={companyId} documentId={documentId} documentStatus={document.status} />
          )}
        </>
      )}
    </AppShell>
  );
}
