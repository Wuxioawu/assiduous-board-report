import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { getCompany } from "@/api/companies";
import { listDocuments, uploadDocument } from "@/api/documents";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Company } from "@/types/company";
import type { CompanyDocument, DocumentStatus } from "@/types/document";

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

export function CompanyUploadView() {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([getCompany(companyId), listDocuments(companyId)])
      .then(([companyData, documentsData]) => {
        setCompany(companyData);
        setDocuments(documentsData);
      })
      .catch(() => setError("Failed to load company or documents"))
      .finally(() => setIsLoading(false));
  }, [companyId]);

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

  return (
    <AppLayout>
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
        <Card>
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
    </AppLayout>
  );
}
