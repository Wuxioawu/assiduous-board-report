import { apiClient } from "@/api/client";
import type { AccuracyReport } from "@/types/accuracyReport";
import type { CompanyDocument } from "@/types/document";

export async function listDocuments(companyId: string): Promise<CompanyDocument[]> {
  const { data } = await apiClient.get<CompanyDocument[]>(`/companies/${companyId}/documents`);
  return data;
}

export async function getDocument(companyId: string, documentId: string): Promise<CompanyDocument> {
  const documents = await listDocuments(companyId);
  const document = documents.find((d) => d.id === documentId);
  if (!document) throw new Error("Document not found");
  return document;
}

export async function reExtractDocument(companyId: string, documentId: string): Promise<CompanyDocument> {
  const { data } = await apiClient.post<CompanyDocument>(
    `/companies/${companyId}/documents/${documentId}/re-extract`,
  );
  return data;
}

export async function getLatestAccuracyReport(
  companyId: string,
  documentId: string,
): Promise<AccuracyReport | null> {
  const { data } = await apiClient.get<AccuracyReport | null>(
    `/companies/${companyId}/documents/${documentId}/accuracy-report`,
  );
  return data;
}

export async function generateAccuracyReport(companyId: string, documentId: string): Promise<AccuracyReport> {
  const { data } = await apiClient.post<AccuracyReport>(`/companies/${companyId}/accuracy-report`, {
    document_id: documentId,
  });
  return data;
}

export async function uploadDocument(
  companyId: string,
  file: File,
  onUploadProgress?: (percent: number) => void,
): Promise<CompanyDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<CompanyDocument>(
    `/companies/${companyId}/documents`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: onUploadProgress
        ? (event) => {
            if (event.total) onUploadProgress((event.loaded / event.total) * 100);
          }
        : undefined,
    },
  );
  return data;
}

export async function deleteDocument(companyId: string, documentId: string): Promise<void> {
  await apiClient.delete(`/companies/${companyId}/documents/${documentId}`);
}
