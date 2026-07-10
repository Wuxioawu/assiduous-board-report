import { apiClient } from "@/api/client";
import type { CompanyDocument } from "@/types/document";

export async function listDocuments(companyId: string): Promise<CompanyDocument[]> {
  const { data } = await apiClient.get<CompanyDocument[]>(`/companies/${companyId}/documents`);
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
