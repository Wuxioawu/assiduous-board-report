import { apiClient } from "@/api/client";
import type { Comment } from "@/types/comment";
import type { Audience } from "@/types/insight";

export async function listComments(companyId: string, period: string, audience: Audience): Promise<Comment[]> {
  const { data } = await apiClient.get<Comment[]>(`/companies/${companyId}/comments`, {
    params: { period, audience },
  });
  return data;
}

export async function createComment(
  companyId: string,
  period: string,
  audience: Audience,
  content: string,
): Promise<Comment> {
  const { data } = await apiClient.post<Comment>(`/companies/${companyId}/comments`, { period, audience, content });
  return data;
}

export async function updateComment(commentId: string, content: string): Promise<Comment> {
  const { data } = await apiClient.patch<Comment>(`/comments/${commentId}`, { content });
  return data;
}

export async function deleteComment(commentId: string): Promise<void> {
  await apiClient.delete(`/comments/${commentId}`);
}
