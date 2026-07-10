export interface TwoFactorSetupResponse {
  qr_code_base64: string;
  secret: string;
}

export interface VerifySetupPayload {
  totp_code: string;
}

export interface BackupCodesResponse {
  backup_codes: string[];
}

export interface DisableTwoFactorPayload {
  current_password: string;
}

export interface LoginVerifyPayload {
  pending_token: string;
  totp_code?: string;
  backup_code?: string;
}
