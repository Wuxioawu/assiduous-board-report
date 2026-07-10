import { apiClient } from "@/api/client";
import type {
  AuthResponse,
  AvatarResponse,
  ChangePasswordPayload,
  ForgotPasswordPayload,
  LoginPayload,
  LoginResult,
  MessageResponse,
  RegisterPayload,
  ResetPasswordPayload,
  User,
} from "@/types/auth";
import type {
  AcceptInvitationBlockedResponse,
  AcceptInvitationPayload,
  AcceptInvitationWithDeletionPayload,
  InvitationPreview,
} from "@/types/team";
import { isAcceptInvitationBlocked } from "@/types/team";
import type { LoginVerifyPayload } from "@/types/twoFactor";

export async function login(payload: LoginPayload): Promise<LoginResult> {
  const { data } = await apiClient.post<LoginResult>("/auth/login", payload);
  return data;
}

export async function verifyTwoFactorLogin(payload: LoginVerifyPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/2fa/login-verify", payload);
  return data;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/register", payload);
  return data;
}

export async function me(): Promise<User> {
  const { data } = await apiClient.get<User>("/auth/me");
  return data;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>("/auth/change-password", payload);
  return data;
}

export async function forgotPassword(payload: ForgotPasswordPayload): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>("/auth/forgot-password", payload);
  return data;
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>("/auth/reset-password", payload);
  return data;
}

export async function acceptInvitation(
  payload: AcceptInvitationPayload,
): Promise<AuthResponse | AcceptInvitationBlockedResponse> {
  const { data } = await apiClient.post("/auth/accept-invitation", payload);
  if (isAcceptInvitationBlocked(data)) {
    return data;
  }
  return data as AuthResponse;
}

export async function acceptInvitationWithDeletion(
  payload: AcceptInvitationWithDeletionPayload,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/auth/accept-invitation-with-deletion", payload);
  return data;
}

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const { data } = await apiClient.get<InvitationPreview>(`/auth/invitations/${token}`);
  return data;
}

export async function uploadAvatar(file: File): Promise<AvatarResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<AvatarResponse>("/auth/me/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteAvatar(): Promise<AvatarResponse> {
  const { data } = await apiClient.delete<AvatarResponse>("/auth/me/avatar");
  return data;
}
