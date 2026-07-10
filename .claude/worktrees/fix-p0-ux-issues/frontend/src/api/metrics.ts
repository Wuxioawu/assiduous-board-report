import { apiClient } from "@/api/client";
import type { MetricHistoryResponse, MetricsResponse } from "@/types/metrics";

export async function getMetrics(companyId: string, period?: string): Promise<MetricsResponse> {
  const { data } = await apiClient.get<MetricsResponse>(`/companies/${companyId}/metrics`, {
    params: period ? { period } : undefined,
  });
  return data;
}

export async function getMetricsHistory(
  companyId: string,
  keys: string[],
): Promise<MetricHistoryResponse> {
  const { data } = await apiClient.get<MetricHistoryResponse>(
    `/companies/${companyId}/metrics/history`,
    { params: { keys: keys.join(",") } },
  );
  return data;
}
