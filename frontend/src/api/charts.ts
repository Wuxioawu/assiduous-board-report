import { apiClient } from "@/api/client";
import type { ChartConfig } from "@/types/chart";

export async function getCharts(companyId: string): Promise<ChartConfig[]> {
  const { data } = await apiClient.get<ChartConfig[]>(`/companies/${companyId}/charts`);
  return data;
}
