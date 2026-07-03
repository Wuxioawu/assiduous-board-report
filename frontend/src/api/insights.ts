import { apiClient } from "@/api/client";
import type { Audience, Insight } from "@/types/insight";

export async function getInsight(companyId: string, audience: Audience): Promise<Insight> {
  const { data } = await apiClient.get<Insight>(`/companies/${companyId}/insights`, {
    params: { audience },
  });
  return data;
}

export async function regenerateInsight(companyId: string, audience: Audience): Promise<Insight> {
  const { data } = await apiClient.post<Insight>(
    `/companies/${companyId}/insights/regenerate`,
    null,
    { params: { audience } },
  );
  return data;
}
