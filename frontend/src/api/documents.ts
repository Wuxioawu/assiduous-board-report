import { apiClient } from "@/api/client";
import type { CompanyDocument } from "@/types/document";

export async function listDocuments(companyId: string): Promise<CompanyDocument[]> {
  const { data } = await apiClient.get<CompanyDocument[]>(`/companies/${companyId}/documents`);
  return data;
}

export async function uploadDocument(companyId: string, file: File): Promise<CompanyDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<CompanyDocument>(
    `/companies/${companyId}/documents`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}
