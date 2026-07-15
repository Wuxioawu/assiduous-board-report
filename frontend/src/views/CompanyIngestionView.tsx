import { ChevronLeft, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchCompanyNow, getCompany, updateCompany } from "@/api/companies";
import { deleteDocument, listDocuments, uploadDocument } from "@/api/documents";
import { getErrorDetail } from "@/api/errors";
import { AppShell } from "@/components/layout/AppShell";
import { PdfDropzone } from "@/components/documents/PdfDropzone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { canEditData } from "@/lib/roles";
import type { Company } from "@/types/company";
import { IN_PROGRESS_DOCUMENT_STATUSES, type CompanyDocument, type DocumentStatus } from "@/types/document";

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

function AutoFetchedBadge({ document }: { document: CompanyDocument }) {
  if (document.source_type !== "auto_fetched") return null;
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
      Auto-fetched
    </span>
  );
}

export function CompanyIngestionView() {
  const { user } = useAuth();
  const canEdit = !!user && canEditData(user.role);
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    pendingItem: pendingDeleteDocument,
    isDeleting: isDeletingDocument,
    error: deleteDocumentError,
    requestDelete: requestDeleteDocument,
    cancel: closeDeleteDocumentModal,
    confirm: confirmDeleteDocument,
  } = useConfirmDelete<CompanyDocument>(async (doc) => {
    if (!companyId) return;
    await deleteDocument(companyId, doc.id);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  }, "Failed to delete document, please try again");

  const [irUrl, setIrUrl] = useState("");
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(false);
  const [isSavingFetchSettings, setIsSavingFetchSettings] = useState(false);
  const [fetchSettingsError, setFetchSettingsError] = useState<string | null>(null);
  const [isCheckingNow, setIsCheckingNow] = useState(false);
  const [checkNowMessage, setCheckNowMessage] = useState<string | null>(null);
  const [checkNowPaused, setCheckNowPaused] = useState(false);
  const [checkNowError, setCheckNowError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const documentsData = await listDocuments(companyId);
    setDocuments(documentsData);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    getCompany(companyId)
      .then(setCompany)
      .catch(() => setError("Failed to load company"));
    refresh()
      .catch(() => setError("Failed to load documents"))
      .finally(() => setIsLoading(false));
  }, [companyId, refresh]);

  useEffect(() => {
    if (!documents.some((doc) => IN_PROGRESS_DOCUMENT_STATUSES.includes(doc.status))) return;
    const interval = setInterval(() => {
      refresh().catch(() => undefined);
    }, 3000);
    return () => clearInterval(interval);
  }, [documents, refresh]);

  useEffect(() => {
    if (!company) return;
    setIrUrl(company.investor_relations_url ?? "");
    setAutoFetchEnabled(company.auto_fetch_enabled);
  }, [company?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveFetchSettings(event: FormEvent) {
    event.preventDefault();
    if (!companyId) return;
    setFetchSettingsError(null);
    setIsSavingFetchSettings(true);
    try {
      const updated = await updateCompany(companyId, {
        investor_relations_url: irUrl.trim() || null,
        auto_fetch_enabled: autoFetchEnabled,
      });
      setCompany(updated);
    } catch (err) {
      setFetchSettingsError(getErrorDetail(err, "Failed to save auto-fetch settings"));
    } finally {
      setIsSavingFetchSettings(false);
    }
  }

  async function handleCheckNow() {
    if (!companyId) return;
    setIsCheckingNow(true);
    setCheckNowMessage(null);
    setCheckNowPaused(false);
    setCheckNowError(null);
    try {
      const result = await fetchCompanyNow(companyId);
      setCheckNowMessage(result.message);
      // The circuit breaker (see auto_fetch.py) can disable auto-fetch mid-check if it
      // detects an anomalous number of "new" documents - reflect that immediately rather
      // than leaving the checkbox showing stale "on" state until the page is reloaded.
      const wasPaused = company?.auto_fetch_enabled === true && result.auto_fetch_enabled === false;
      setCheckNowPaused(wasPaused);
      setCompany((prev) =>
        prev
          ? { ...prev, last_fetch_checked_at: result.last_fetch_checked_at, auto_fetch_enabled: result.auto_fetch_enabled }
          : prev,
      );
      setAutoFetchEnabled(result.auto_fetch_enabled);
      if (result.found_new > 0) {
        refresh().catch(() => undefined);
      }
    } catch (err) {
      setCheckNowError(getErrorDetail(err, "Failed to check for new documents"));
    } finally {
      setIsCheckingNow(false);
    }
  }

  async function handleUploadFile(file: File, onProgress: (percent: number) => void) {
    if (!companyId) return;
    const document = await uploadDocument(companyId, file, onProgress);
    setDocuments((prev) => [document, ...prev]);
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
      <h1 className="mb-1 text-2xl font-bold text-navy">
        Document Ingestion{company ? ` · ${company.name}` : ""}
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Upload filings manually or configure automated fetching from an investor-relations page.
      </p>

      {canEdit ? (
        <Card className="mb-6" title="Upload PDF">
          <PdfDropzone onUpload={handleUploadFile} />
        </Card>
      ) : (
        // Matches BudgetSettingsView's pattern: explain the restriction rather
        // than just omitting the upload/fetch sections with no explanation.
        <Card className="mb-6">
          <p className="text-sm text-muted">
            You don't have permission to upload documents or configure automated fetching. Contact an
            owner, admin, or analyst on your team.
          </p>
        </Card>
      )}

      {canEdit && (
        <Card className="mb-6" title="Automated Fetching">
          <form onSubmit={handleSaveFetchSettings} className="flex flex-col gap-3">
            <Input
              label="Investor-relations page URL"
              name="investorRelationsUrl"
              type="url"
              value={irUrl}
              onChange={(e) => setIrUrl(e.target.value)}
              placeholder="https://example.com/investor-relations"
            />
            <p className="-mt-2 text-xs text-muted">
              When set, the platform periodically checks this page for new PDF filings and ingests them
              automatically, the same way a manual upload does.
            </p>
            <label className="flex items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                checked={autoFetchEnabled}
                onChange={(e) => setAutoFetchEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-surface-border text-coral focus:ring-coral"
              />
              Enable automatic fetching
            </label>

            {fetchSettingsError && <p className="text-sm text-destructive">{fetchSettingsError}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isSavingFetchSettings}>
                {isSavingFetchSettings ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isCheckingNow || !company?.investor_relations_url}
                onClick={handleCheckNow}
              >
                {isCheckingNow ? "Checking…" : "Check Now"}
              </Button>
              <span className="text-xs text-muted">
                Last checked:{" "}
                {company?.last_fetch_checked_at ? new Date(company.last_fetch_checked_at).toLocaleString() : "Never"}
              </span>
            </div>

            {checkNowMessage && (
              <p
                className={
                  checkNowPaused
                    ? "rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
                    : "text-sm text-[var(--status-good)]"
                }
              >
                {checkNowMessage}
              </p>
            )}
            {checkNowError && <p className="text-sm text-destructive">{checkNowError}</p>}
          </form>
        </Card>
      )}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : documents.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No documents uploaded yet for this company.
          </p>
        </Card>
      ) : (
        <Card className="mb-6">
          {/* Table for sm and up; four columns still crowd out a phone width
              (the filename alone can eat the row), so narrow screens get a
              card list below instead. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="pb-2 font-medium">Filename</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Uploaded</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-t border-surface-border transition-colors hover:bg-cream/60">
                    <td className="py-2 text-navy">
                      <Link
                        to={`/companies/${companyId}/documents/${doc.id}`}
                        className="font-medium text-navy hover:text-coral hover:underline"
                      >
                        {doc.filename}
                      </Link>
                      <AutoFetchedBadge document={doc} />
                    </td>
                    <td className={`py-2 font-medium ${STATUS_STYLES[doc.status]}`}>
                      {STATUS_LABELS[doc.status]}
                      {doc.status === "failed" && doc.error_message && (
                        <span
                          className="ml-2 cursor-help text-xs font-normal text-muted"
                          title={doc.error_message}
                        >
                          (why?)
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 text-muted">
                      {new Date(doc.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => requestDeleteDocument(doc)}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-destructive/60 transition-colors hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 sm:hidden">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-surface-border p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <Link
                    to={`/companies/${companyId}/documents/${doc.id}`}
                    className="min-w-0 flex-1 break-words text-sm font-medium text-navy hover:text-coral hover:underline"
                  >
                    {doc.filename}
                    <AutoFetchedBadge document={doc} />
                  </Link>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => requestDeleteDocument(doc)}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-destructive/60 transition-colors hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </button>
                  )}
                </div>
                <p className={`text-xs font-medium ${STATUS_STYLES[doc.status]}`}>
                  {STATUS_LABELS[doc.status]}
                  {doc.status === "failed" && doc.error_message && (
                    <span
                      className="ml-2 cursor-help font-normal text-muted"
                      title={doc.error_message}
                    >
                      (why?)
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(doc.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {pendingDeleteDocument && (
        <Modal title="Delete Document" onClose={closeDeleteDocumentModal}>
          <div className="mb-4 space-y-2 text-sm text-navy">
            <p>
              Delete{" "}
              <span className="font-semibold text-navy">
                {pendingDeleteDocument.filename}
              </span>
              ?
            </p>
            <p className="text-xs text-muted">
              All financial data extracted from this document will be permanently deleted, and any
              metrics or AI insights derived from it will be recalculated without it. This cannot be
              undone.
            </p>
            {deleteDocumentError && <p className="text-sm text-destructive">{deleteDocumentError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDeleteDocumentModal} disabled={isDeletingDocument}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteDocument} disabled={isDeletingDocument}>
              {isDeletingDocument ? "Deleting…" : "Delete Document"}
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
