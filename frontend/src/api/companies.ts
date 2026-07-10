import { apiClient } from "@/api/client";
import type {
  Company,
  CompanyCreatePayload,
  CompanyFetchResult,
  CompanyLogoResponse,
  CompanyPeriod,
  CompanyUpdatePayload,
} from "@/types/company";

export async function listCompanies(): Promise<Company[]> {
  const { data } = await apiClient.get<Company[]>("/companies");
  return data;
}

export async function createCompany(payload: CompanyCreatePayload): Promise<Company> {
  const { data } = await apiClient.post<Company>("/companies", payload);
  return data;
}

export async function updateCompany(id: string, payload: CompanyUpdatePayload): Promise<Company> {
  const { data } = await apiClient.patch<Company>(`/companies/${id}`, payload);
  return data;
}

export async function getCompany(id: string): Promise<Company> {
  const { data } = await apiClient.get<Company>(`/companies/${id}`);
  return data;
}

export async function getCompanyPeriods(id: string): Promise<CompanyPeriod[]> {
  const { data } = await apiClient.get<CompanyPeriod[]>(`/companies/${id}/periods`);
  return data;
}

export async function deleteCompany(id: string): Promise<void> {
  await apiClient.delete(`/companies/${id}`);
}

export async function fetchCompanyNow(id: string): Promise<CompanyFetchResult> {
  const { data } = await apiClient.post<CompanyFetchResult>(`/companies/${id}/fetch-now`);
  return data;
}

export async function uploadCompanyLogo(id: string, file: File): Promise<CompanyLogoResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<CompanyLogoResponse>(`/companies/${id}/logo`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteCompanyLogo(id: string): Promise<CompanyLogoResponse> {
  const { data } = await apiClient.delete<CompanyLogoResponse>(`/companies/${id}/logo`);
  return data;
}
