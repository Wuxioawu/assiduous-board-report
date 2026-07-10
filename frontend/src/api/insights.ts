import { apiClient } from "@/api/client";
import type { Audience, Insight, StructuredInsightContent } from "@/types/insight";

export async function getInsight(companyId: string, audience: Audience, period?: string): Promise<Insight> {
  const { data } = await apiClient.get<Insight>(`/companies/${companyId}/insights`, {
    params: period ? { audience, period } : { audience },
  });
  return data;
}

export async function regenerateInsight(
  companyId: string,
  audience: Audience,
  period?: string,
  confirmOverwriteEdit?: boolean,
): Promise<Insight> {
  const { data } = await apiClient.post<Insight>(
    `/companies/${companyId}/insights/regenerate`,
    null,
    {
      params: {
        audience,
        ...(period ? { period } : {}),
        ...(confirmOverwriteEdit ? { confirm_overwrite_edit: true } : {}),
      },
    },
  );
  return data;
}

export async function updateInsight(
  insightId: string,
  content: StructuredInsightContent,
): Promise<Insight> {
  const { data } = await apiClient.patch<Insight>(`/insights/${insightId}`, content);
  return data;
}

export async function revertInsightToAi(insightId: string): Promise<Insight> {
  const { data } = await apiClient.post<Insight>(`/insights/${insightId}/revert-to-ai`);
  return data;
}
