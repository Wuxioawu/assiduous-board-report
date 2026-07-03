import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { getCompany } from "@/api/companies";
import { listDocuments, uploadDocument } from "@/api/documents";
import {
  listFinancialStatementAuditLog,
  listFinancialStatements,
  updateFinancialStatement,
} from "@/api/financialStatements";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Company } from "@/types/company";
import type { CompanyDocument, DocumentStatus } from "@/types/document";
import type { FinancialStatement, FinancialStatementAuditEntry } from "@/types/financialStatement";

interface PendingOverride {
  statement: FinancialStatement;
  newValue: number;
  originalValue: number;
}

const STATUS_STYLES: Record<DocumentStatus, string> = {
  pending: "text-slate-600 dark:text-slate-300",
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

const IN_PROGRESS_STATUSES: DocumentStatus[] = ["pending", "processing"];

export function CompanyUploadView() {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [statements, setStatements] = useState<FinancialStatement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pendingOverride, setPendingOverride] = useState<PendingOverride | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<FinancialStatementAuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const [documentsData, statementsData] = await Promise.all([
      listDocuments(companyId),
      listFinancialStatements(companyId),
    ]);
    setDocuments(documentsData);
    setStatements(statementsData);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    getCompany(companyId)
      .then(setCompany)
      .catch(() => setError("Failed to load company"));
    refresh()
      .catch(() => setError("Failed to load documents or financial statements"))
      .finally(() => setIsLoading(false));
  }, [companyId, refresh]);

  useEffect(() => {
    if (!documents.some((doc) => IN_PROGRESS_STATUSES.includes(doc.status))) return;
    const interval = setInterval(() => {
      refresh().catch(() => undefined);
    }, 3000);
    return () => clearInterval(interval);
  }, [documents, refresh]);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!companyId) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF file to upload");
      return;
    }

    setError(null);
    setIsUploading(true);
    try {
      const document = await uploadDocument(companyId, file);
      setDocuments((prev) => [document, ...prev]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError("Upload failed. Only PDF files are supported.");
    } finally {
      setIsUploading(false);
    }
  }

  function startEdit(statement: FinancialStatement) {
    setEditingId(statement.id);
    setEditValue(String(statement.value));
  }

  async function requestSaveEdit(statement: FinancialStatement) {
    const parsed = Number(editValue);
    if (Number.isNaN(parsed)) {
      setError("Enter a valid number");
      return;
    }
    setError(null);

    // If this line item was already overridden once, its current `value` is no
    // longer the AI's figure — look up the earliest audit entry to surface the
    // true original AI-extracted value in the confirmation dialog.
    let originalValue = statement.value;
    if (statement.extracted_by === "manual_override") {
      try {
        const entries = await listFinancialStatementAuditLog(statement.id);
        const earliest = entries[entries.length - 1];
        if (earliest?.extra_data?.previous_value != null) {
          originalValue = Number(earliest.extra_data.previous_value);
        }
      } catch {
        // Fall back to the current (already-overridden) value.
      }
    }

    setPendingOverride({ statement, newValue: parsed, originalValue });
  }

  function cancelOverride() {
    setPendingOverride(null);
  }

  async function confirmOverride() {
    if (!pendingOverride) return;
    const { statement, newValue } = pendingOverride;
    setIsSaving(true);
    try {
      const updated = await updateFinancialStatement(statement.id, newValue);
      setStatements((prev) => prev.map((s) => (s.id === statement.id ? updated : s)));
      setEditingId(null);
      setPendingOverride(null);
      if (historyId === statement.id) {
        await loadHistory(statement.id);
      }
    } catch {
      setError("Failed to save the corrected value");
      setPendingOverride(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function loadHistory(statementId: string) {
    setHistoryLoading(true);
    try {
      const entries = await listFinancialStatementAuditLog(statementId);
      setHistoryEntries(entries);
    } catch {
      setError("Failed to load override history");
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory(statementId: string) {
    if (historyId === statementId) {
      setHistoryId(null);
      return;
    }
    setHistoryId(statementId);
    setHistoryEntries([]);
    loadHistory(statementId);
  }

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-white">
        Documents{company ? ` · ${company.name}` : ""}
      </h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Company ID: {companyId}</p>

      <Card className="mb-6">
        <form onSubmit={handleUpload} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Upload PDF
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="block w-full text-sm text-slate-600 dark:text-slate-300"
            />
          </div>
          <Button type="submit" disabled={isUploading}>
            {isUploading ? "Uploading…" : "Upload"}
          </Button>
        </form>
      </Card>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : documents.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No documents uploaded yet for this company.
          </p>
        </Card>
      ) : (
        <Card className="mb-6">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="pb-2 font-medium">Filename</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 text-slate-900 dark:text-white">{doc.filename}</td>
                  <td className={`py-2 font-medium ${STATUS_STYLES[doc.status]}`}>
                    {STATUS_LABELS[doc.status]}
                    {doc.status === "failed" && doc.error_message && (
                      <span
                        className="ml-2 cursor-help text-xs font-normal text-slate-400"
                        title={doc.error_message}
                      >
                        (why?)
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">
                    {new Date(doc.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {statements.length > 0 && (
        <Card title="Extracted Financial Data">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="pb-2 font-medium">Taxonomy Code</th>
                <th className="pb-2 font-medium">Value</th>
                <th className="pb-2 font-medium">Currency</th>
                <th className="pb-2 font-medium">Period</th>
                <th className="pb-2 font-medium">Confidence</th>
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {statements.map((statement) => (
                <Fragment key={statement.id}>
                  <tr className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-mono text-xs text-slate-900 dark:text-white">
                      {statement.taxonomy_code}
                    </td>
                    <td className="py-2 text-slate-900 dark:text-white">
                      {editingId === statement.id ? (
                        <input
                          type="number"
                          className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        statement.value.toLocaleString()
                      )}
                    </td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{statement.currency}</td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">
                      {statement.period_start} → {statement.period_end}
                    </td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">
                      {statement.confidence_score != null
                        ? `${Math.round(statement.confidence_score * 100)}%`
                        : "—"}
                    </td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">
                      {statement.source_excerpt ? (
                        <span
                          className="cursor-help underline decoration-dotted"
                          title={`${statement.source_excerpt}${
                            statement.source_page ? ` (page ${statement.source_page})` : ""
                          }`}
                        >
                          excerpt
                        </span>
                      ) : (
                        "—"
                      )}
                      {statement.extracted_by === "manual_override" && (
                        <span className="ml-2 text-xs text-[var(--status-warning)]">edited</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {statement.extracted_by === "manual_override" && editingId !== statement.id && (
                          <Button variant="secondary" onClick={() => toggleHistory(statement.id)}>
                            {historyId === statement.id ? "Hide History" : "History"}
                          </Button>
                        )}
                        {editingId === statement.id ? (
                          <>
                            <Button variant="secondary" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                            <Button onClick={() => requestSaveEdit(statement)}>Save</Button>
                          </>
                        ) : (
                          <Button variant="secondary" onClick={() => startEdit(statement)}>
                            Edit
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {historyId === statement.id && (
                    <tr className="border-t border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                      <td colSpan={7} className="px-2 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {historyLoading ? (
                          "Loading override history…"
                        ) : historyEntries.length === 0 ? (
                          "No manual overrides recorded for this line item."
                        ) : (
                          <div className="space-y-1">
                            <p className="font-medium text-slate-700 dark:text-slate-200">
                              AI:{" "}
                              {Number(
                                historyEntries[historyEntries.length - 1].extra_data?.previous_value ?? 0,
                              ).toLocaleString()}
                              {" → "}
                              Manual: {statement.value.toLocaleString()}
                            </p>
                            <ul className="space-y-0.5">
                              {historyEntries.map((entry) => (
                                <li key={entry.id} className="text-slate-500 dark:text-slate-400">
                                  {new Date(entry.created_at).toLocaleString()}:{" "}
                                  {Number(entry.extra_data?.previous_value ?? 0).toLocaleString()} →{" "}
                                  {Number(entry.extra_data?.new_value ?? 0).toLocaleString()}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pendingOverride && (
        <ConfirmDialog
          title="Confirm manual override"
          confirmLabel={isSaving ? "Saving…" : "Confirm Override"}
          confirmDisabled={isSaving}
          onConfirm={confirmOverride}
          onCancel={cancelOverride}
        >
          <dl className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Taxonomy code</dt>
              <dd className="font-mono text-xs font-medium text-slate-900 dark:text-white">
                {pendingOverride.statement.taxonomy_code}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">AI-extracted value</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {pendingOverride.originalValue.toLocaleString()}
                {pendingOverride.statement.confidence_score != null &&
                  ` (${Math.round(pendingOverride.statement.confidence_score * 100)}% confidence)`}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">New value</dt>
              <dd className="font-medium text-[var(--status-warning)]">
                {pendingOverride.newValue.toLocaleString()}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            This will overwrite the AI-extracted value and record the change in the audit log.
          </p>
        </ConfirmDialog>
      )}
    </AppShell>
  );
}
