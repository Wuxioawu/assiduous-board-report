import { apiClient } from "@/api/client";
import type {
  Invitation,
  InviteEligibility,
  InviteMemberPayload,
  Member,
  UpdateMemberRolePayload,
} from "@/types/team";

export async function listMembers(): Promise<Member[]> {
  const { data } = await apiClient.get<Member[]>("/organizations/members");
  return data;
}

export async function updateMemberRole(userId: string, payload: UpdateMemberRolePayload): Promise<Member> {
  const { data } = await apiClient.patch<Member>(`/organizations/members/${userId}/role`, payload);
  return data;
}

export async function removeMember(userId: string): Promise<void> {
  await apiClient.delete(`/organizations/members/${userId}`);
}

export async function listInvitations(): Promise<Invitation[]> {
  const { data } = await apiClient.get<Invitation[]>("/organizations/invitations");
  return data;
}

export async function inviteMember(payload: InviteMemberPayload): Promise<Invitation> {
  const { data } = await apiClient.post<Invitation>("/organizations/invitations", payload);
  return data;
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await apiClient.delete(`/organizations/invitations/${invitationId}`);
}

export async function checkInviteEligibility(email: string): Promise<InviteEligibility> {
  const { data } = await apiClient.get<InviteEligibility>("/organizations/invitations/check", {
    params: { email },
  });
  return data;
}
