import { apiClient } from "@/api/client";
import type { MessageResponse } from "@/types/auth";
import type {
  BackupCodesResponse,
  DisableTwoFactorPayload,
  TwoFactorSetupResponse,
  VerifySetupPayload,
} from "@/types/twoFactor";

export async function setupTwoFactor(): Promise<TwoFactorSetupResponse> {
  const { data } = await apiClient.post<TwoFactorSetupResponse>("/auth/2fa/setup");
  return data;
}

export async function verifyTwoFactorSetup(payload: VerifySetupPayload): Promise<BackupCodesResponse> {
  const { data } = await apiClient.post<BackupCodesResponse>("/auth/2fa/verify-setup", payload);
  return data;
}

export async function disableTwoFactor(payload: DisableTwoFactorPayload): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>("/auth/2fa/disable", payload);
  return data;
}

export async function regenerateBackupCodes(): Promise<BackupCodesResponse> {
  const { data } = await apiClient.post<BackupCodesResponse>("/auth/2fa/regenerate-backup-codes");
  return data;
}
