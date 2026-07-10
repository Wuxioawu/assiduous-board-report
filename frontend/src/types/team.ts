import type { UserRole } from "@/types/auth";

export type InvitationStatus = "pending" | "accepted" | "expired";

// "new_user": the invited email has no existing account anywhere.
// "transfer": the invited email already has an account in a different
// organization - accepting moves that account here instead of creating a second one.
export type InvitationType = "new_user" | "transfer";

export interface Member {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  avatar_url: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  invitation_type: InvitationType;
  invited_by_user_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface InviteEligibility {
  invitation_type: InvitationType;
  current_organization_name: string | null;
}

export interface InvitationPreview {
  email: string;
  organization_name: string;
  role: UserRole;
  invitation_type: InvitationType;
  current_organization_name: string | null;
}

export interface InviteMemberPayload {
  email: string;
  role: UserRole;
}

export interface UpdateMemberRolePayload {
  role: UserRole;
}

export interface AcceptInvitationPayload {
  token: string;
  full_name?: string;
  password: string;
}

export interface AcceptInvitationBlockedResponse {
  blocked: true;
  reason: "sole_member";
  can_delete_and_transfer: true;
  current_organization_name: string;
}

export interface AcceptInvitationWithDeletionPayload {
  token: string;
  password: string;
  confirm_organization_name: string;
}

export function isAcceptInvitationBlocked(
  result: unknown,
): result is AcceptInvitationBlockedResponse {
  return (
    typeof result === "object" &&
    result !== null &&
    "blocked" in result &&
    (result as AcceptInvitationBlockedResponse).blocked === true
  );
}
