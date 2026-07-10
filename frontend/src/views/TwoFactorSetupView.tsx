import { useState, type FormEvent } from "react";

import { disableTwoFactor, regenerateBackupCodes, setupTwoFactor, verifyTwoFactorSetup } from "@/api/twoFactor";
import { getErrorDetail } from "@/api/errors";
import { BackupCodesReveal } from "@/components/account/BackupCodesReveal";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SixDigitCodeInput } from "@/components/ui/SixDigitCodeInput";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { useAuth } from "@/hooks/useAuth";
import type { TwoFactorSetupResponse } from "@/types/twoFactor";

// The toggle's own visual on/off is driven by this state machine, not just
// user.totp_enabled directly - it needs to stay "on" through the setup flow
// (before totp_enabled actually flips server-side) and stay "on" while an
// already-enabled account is mid-disable-confirmation.
type FlowState = "idle-off" | "starting-setup" | "setup-qr" | "backup-codes" | "idle-on" | "disable-confirm";
type BackupCodesMode = "setup" | "regenerate";

export function TwoFactorSetupView() {
  const { user, refreshUser } = useAuth();
  const [flowState, setFlowState] = useState<FlowState>(user?.totp_enabled ? "idle-on" : "idle-off");

  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isVerifyingSetup, setIsVerifyingSetup] = useState(false);

  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesMode, setBackupCodesMode] = useState<BackupCodesMode>("setup");

  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);
  const [isDisabling, setIsDisabling] = useState(false);

  const [pendingRegenerate, setPendingRegenerate] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  if (!user) return null;

  const toggleOn = flowState !== "idle-off";
  const sectionOpen = flowState === "setup-qr" || flowState === "disable-confirm" || flowState === "backup-codes";
  const toggleInteractionDisabled =
    flowState === "starting-setup" || flowState === "backup-codes" || isVerifyingSetup || isDisabling;

  function cancelSetup() {
    setFlowState("idle-off");
    setSetupData(null);
    setTotpCode("");
    setSetupError(null);
  }

  function cancelDisable() {
    setFlowState("idle-on");
    setDisablePassword("");
    setDisableError(null);
  }

  async function handleToggle() {
    if (flowState === "idle-off") {
      setSetupError(null);
      setFlowState("starting-setup");
      try {
        const data = await setupTwoFactor();
        setSetupData(data);
        setFlowState("setup-qr");
      } catch (err) {
        setSetupError(getErrorDetail(err, "Failed to start two-factor setup"));
        setFlowState("idle-off");
      }
    } else if (flowState === "idle-on") {
      setDisableError(null);
      setDisablePassword("");
      setFlowState("disable-confirm");
    } else if (flowState === "setup-qr") {
      cancelSetup();
    } else if (flowState === "disable-confirm") {
      cancelDisable();
    }
  }

  async function handleVerifySetup(event: FormEvent) {
    event.preventDefault();
    setSetupError(null);
    setIsVerifyingSetup(true);
    try {
      const { backup_codes } = await verifyTwoFactorSetup({ totp_code: totpCode });
      setBackupCodes(backup_codes);
      setBackupCodesMode("setup");
      setFlowState("backup-codes");
    } catch (err) {
      setSetupError(getErrorDetail(err, "Invalid code, please try again."));
      setTotpCode("");
    } finally {
      setIsVerifyingSetup(false);
    }
  }

  async function finishBackupCodesReveal() {
    await refreshUser();
    setFlowState("idle-on");
    setSetupData(null);
    setTotpCode("");
    setBackupCodes([]);
  }

  async function confirmDisable(event: FormEvent) {
    event.preventDefault();
    setIsDisabling(true);
    setDisableError(null);
    try {
      await disableTwoFactor({ current_password: disablePassword });
      await refreshUser();
      setFlowState("idle-off");
      setDisablePassword("");
    } catch (err) {
      setDisableError(getErrorDetail(err, "Failed to disable two-factor authentication"));
    } finally {
      setIsDisabling(false);
    }
  }

  function closeRegenerateModal() {
    if (isRegenerating) return;
    setPendingRegenerate(false);
    setRegenerateError(null);
  }

  async function confirmRegenerate() {
    setIsRegenerating(true);
    setRegenerateError(null);
    try {
      const { backup_codes } = await regenerateBackupCodes();
      setBackupCodes(backup_codes);
      setBackupCodesMode("regenerate");
      setPendingRegenerate(false);
      setFlowState("backup-codes");
    } catch (err) {
      setRegenerateError(getErrorDetail(err, "Failed to regenerate backup codes"));
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-bold text-navy">Two-Factor Authentication</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Add an extra layer of security to your account with an authenticator app.
      </p>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-navy">Authenticator App</p>
            <p className="mt-1 text-sm text-muted">
              {toggleOn
                ? "Your account is protected with an authenticator app."
                : "Use an app like Google Authenticator, Authy, or 1Password to generate one-time codes at login."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <span className={`text-sm font-medium ${toggleOn ? "text-emerald-700" : "text-muted"}`}>
              {toggleOn ? "On" : "Off"}
            </span>
            <ToggleSwitch
              checked={toggleOn}
              loading={flowState === "starting-setup"}
              disabled={toggleInteractionDisabled}
              onChange={handleToggle}
              ariaLabel="Two-factor authentication"
            />
          </div>
        </div>

        {flowState === "idle-off" && setupError && (
          <p className="mt-3 text-sm text-destructive">{setupError}</p>
        )}

        <CollapsibleSection open={sectionOpen}>
          <div className="mt-5 border-t border-surface-border pt-5">
            {flowState === "setup-qr" && setupData && (
              <>
                <p className="mb-3 text-sm font-semibold text-navy">Scan this QR code</p>
                <div className="mb-4 flex justify-center">
                  <img
                    src={`data:image/png;base64,${setupData.qr_code_base64}`}
                    alt="Two-factor authentication QR code"
                    className="h-48 w-48 rounded-md border border-surface-border"
                  />
                </div>
                <p className="mb-2 text-sm text-muted">
                  Can't scan? Enter this code manually in your authenticator app:
                </p>
                <p className="mb-4 select-all rounded-md bg-cream px-3 py-2 font-mono text-sm text-navy">
                  {setupData.secret}
                </p>
                <form onSubmit={handleVerifySetup} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-navy">
                      Enter the 6-digit code from your app
                    </label>
                    <SixDigitCodeInput
                      value={totpCode}
                      onChange={setTotpCode}
                      error={!!setupError}
                      disabled={isVerifyingSetup}
                      autoFocus
                    />
                  </div>
                  {setupError && <p className="text-sm text-destructive">{setupError}</p>}
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={cancelSetup} type="button" disabled={isVerifyingSetup}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isVerifyingSetup || totpCode.length !== 6}>
                      {isVerifyingSetup ? "Verifying…" : "Verify & Enable"}
                    </Button>
                  </div>
                </form>
              </>
            )}

            {flowState === "disable-confirm" && (
              <>
                <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Disabling 2FA reduces your account's security — are you sure?
                </p>
                <form onSubmit={confirmDisable} className="flex flex-col gap-4">
                  <Input
                    label="Current Password"
                    type="password"
                    name="disablePassword"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    autoFocus
                    required
                  />
                  {disableError && <p className="text-sm text-destructive">{disableError}</p>}
                  <div className="flex gap-2">
                    <Button variant="secondary" type="button" onClick={cancelDisable} disabled={isDisabling}>
                      Cancel
                    </Button>
                    <Button variant="danger" type="submit" disabled={isDisabling}>
                      {isDisabling ? "Disabling…" : "Disable 2FA"}
                    </Button>
                  </div>
                </form>
              </>
            )}

            {flowState === "backup-codes" && (
              <BackupCodesReveal codes={backupCodes} onDone={finishBackupCodesReveal} mode={backupCodesMode} embedded />
            )}
          </div>
        </CollapsibleSection>

        {flowState === "idle-on" && (
          <div className="mt-5 border-t border-surface-border pt-5">
            <Button variant="secondary" onClick={() => setPendingRegenerate(true)}>
              Regenerate Backup Codes
            </Button>
          </div>
        )}
      </Card>

      {pendingRegenerate && (
        <Modal title="Regenerate Backup Codes" onClose={closeRegenerateModal}>
          <div className="mb-4 space-y-2 text-sm text-navy">
            <p>
              Regenerating will immediately invalidate your existing backup codes. Any of the old codes
              will no longer work.
            </p>
            {regenerateError && <p className="text-sm text-destructive">{regenerateError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeRegenerateModal} disabled={isRegenerating}>
              Cancel
            </Button>
            <Button onClick={confirmRegenerate} disabled={isRegenerating}>
              {isRegenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
