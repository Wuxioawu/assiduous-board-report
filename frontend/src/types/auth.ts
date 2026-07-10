export type UserRole = "owner" | "admin" | "analyst" | "viewer";

export interface User {
  id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  totp_enabled: boolean;
  avatar_url: string | null;
}

export interface AvatarResponse {
  avatar_url: string | null;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface AuthResponse {
  token: AuthToken;
  user: User;
}

export interface PendingTwoFactorResponse {
  requires_2fa: true;
  pending_token: string;
}

export type LoginResult = AuthResponse | PendingTwoFactorResponse;

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  organization_name: string;
  full_name: string;
  email: string;
  password: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  new_password: string;
}

export interface MessageResponse {
  message: string;
}
