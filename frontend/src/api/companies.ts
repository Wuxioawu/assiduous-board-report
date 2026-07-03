import { apiClient } from "@/api/client";
import type { Company, CompanyCreatePayload } from "@/types/company";

export async function listCompanies(): Promise<Company[]> {
  const { data } = await apiClient.get<Company[]>("/companies");
  return data;
}

export async function createCompany(payload: CompanyCreatePayload): Promise<Company> {
  const { data } = await apiClient.post<Company>("/companies", payload);
  return data;
}

export async function getCompany(id: string): Promise<Company> {
  const { data } = await apiClient.get<Company>(`/companies/${id}`);
  return data;
}
