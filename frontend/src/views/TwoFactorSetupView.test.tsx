import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/twoFactor", () => ({
  setupTwoFactor: vi.fn(),
  verifyTwoFactorSetup: vi.fn(),
  disableTwoFactor: vi.fn(),
  regenerateBackupCodes: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { disableTwoFactor, regenerateBackupCodes, setupTwoFactor, verifyTwoFactorSetup } from "@/api/twoFactor";
import { useAuth } from "@/hooks/useAuth";
import { TwoFactorSetupView } from "@/views/TwoFactorSetupView";

const refreshUser = vi.fn();

function mockAuth(totpEnabled: boolean) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "user-1", totp_enabled: totpEnabled },
    refreshUser,
  } as unknown as ReturnType<typeof useAuth>);
}

function toggle() {
  return screen.getByRole("switch", { name: "Two-factor authentication" });
}

describe("TwoFactorSetupView", () => {
  beforeEach(() => {
    vi.mocked(setupTwoFactor).mockReset();
    vi.mocked(verifyTwoFactorSetup).mockReset();
    vi.mocked(disableTwoFactor).mockReset();
    vi.mocked(regenerateBackupCodes).mockReset();
    refreshUser.mockReset();
  });

  describe("enabling 2FA from scratch", () => {
    it("starts setup, shows the QR code and secret, then verifies and reveals backup codes", async () => {
      mockAuth(false);
      vi.mocked(setupTwoFactor).mockResolvedValue({ qr_code_base64: "AAAA", secret: "JBSWY3DPEHPK3PXP" });
      vi.mocked(verifyTwoFactorSetup).mockResolvedValue({
        backup_codes: ["AAAA-1111", "BBBB-2222"],
      });

      render(<TwoFactorSetupView />);
      expect(toggle()).toHaveAttribute("aria-checked", "false");

      fireEvent.click(toggle());
      await waitFor(() => expect(setupTwoFactor).toHaveBeenCalled());
      expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
      expect(toggle()).toHaveAttribute("aria-checked", "true");

      fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "123456" } });
      fireEvent.click(screen.getByRole("button", { name: "Verify & Enable" }));

      await waitFor(() => expect(verifyTwoFactorSetup).toHaveBeenCalledWith({ totp_code: "123456" }));
      expect(
        await screen.findByText("Two-factor authentication is now enabled for your account."),
      ).toBeInTheDocument();
      expect(screen.getByText("AAAA-1111")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "I've saved these codes" }));
      await waitFor(() => expect(refreshUser).toHaveBeenCalled());
      expect(await screen.findByRole("button", { name: "Regenerate Backup Codes" })).toBeInTheDocument();
    });

    it("shows an error and resets the toggle when starting setup fails", async () => {
      mockAuth(false);
      vi.mocked(setupTwoFactor).mockRejectedValue({
        isAxiosError: true,
        response: { data: { detail: "Two-factor authentication is already enabled" } },
      });

      render(<TwoFactorSetupView />);
      fireEvent.click(toggle());

      expect(await screen.findByText("Two-factor authentication is already enabled")).toBeInTheDocument();
      expect(toggle()).toHaveAttribute("aria-checked", "false");
    });

    it("clears the code and shows an error on an invalid verification attempt", async () => {
      mockAuth(false);
      vi.mocked(setupTwoFactor).mockResolvedValue({ qr_code_base64: "AAAA", secret: "SECRET" });
      vi.mocked(verifyTwoFactorSetup).mockRejectedValue({
        isAxiosError: true,
        response: { data: { detail: "Invalid code, please try again." } },
      });

      render(<TwoFactorSetupView />);
      fireEvent.click(toggle());
      await screen.findByText("SECRET");

      fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "000000" } });
      fireEvent.click(screen.getByRole("button", { name: "Verify & Enable" }));

      expect(await screen.findByText("Invalid code, please try again.")).toBeInTheDocument();
      await waitFor(() => expect((screen.getByLabelText("Digit 1 of 6") as HTMLInputElement).value).toBe(""));
    });

    it("cancels setup and returns to the off state", async () => {
      mockAuth(false);
      vi.mocked(setupTwoFactor).mockResolvedValue({ qr_code_base64: "AAAA", secret: "SECRET" });

      render(<TwoFactorSetupView />);
      fireEvent.click(toggle());
      await screen.findByText("SECRET");

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(toggle()).toHaveAttribute("aria-checked", "false");
      expect(screen.queryByText("SECRET")).not.toBeInTheDocument();
    });

    it("disables Verify & Enable until 6 digits are entered", async () => {
      mockAuth(false);
      vi.mocked(setupTwoFactor).mockResolvedValue({ qr_code_base64: "AAAA", secret: "SECRET" });

      render(<TwoFactorSetupView />);
      fireEvent.click(toggle());
      await screen.findByText("SECRET");

      expect(screen.getByRole("button", { name: "Verify & Enable" })).toBeDisabled();
    });
  });

  describe("disabling an already-enabled 2FA", () => {
    it("shows On and a Regenerate Backup Codes action", () => {
      mockAuth(true);
      render(<TwoFactorSetupView />);

      expect(toggle()).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("button", { name: "Regenerate Backup Codes" })).toBeInTheDocument();
    });

    it("requires the current password and shows the backend error on failure", async () => {
      mockAuth(true);
      vi.mocked(disableTwoFactor).mockRejectedValue({
        isAxiosError: true,
        response: { data: { detail: "Current password is incorrect" } },
      });

      render(<TwoFactorSetupView />);
      fireEvent.click(toggle());
      fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "wrong" } });
      fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));

      expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
      expect(refreshUser).not.toHaveBeenCalled();
    });

    it("disables 2FA on success and returns to the off state", async () => {
      mockAuth(true);
      vi.mocked(disableTwoFactor).mockResolvedValue({ message: "Two-factor authentication has been disabled." });

      render(<TwoFactorSetupView />);
      fireEvent.click(toggle());
      fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));

      await waitFor(() =>
        expect(disableTwoFactor).toHaveBeenCalledWith({ current_password: "password123" }),
      );
      await waitFor(() => expect(refreshUser).toHaveBeenCalled());
      expect(toggle()).toHaveAttribute("aria-checked", "false");
    });

    it("cancels the disable confirmation without calling the API", () => {
      mockAuth(true);
      render(<TwoFactorSetupView />);
      fireEvent.click(toggle());
      expect(screen.getByLabelText("Current Password")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(toggle()).toHaveAttribute("aria-checked", "true");
      expect(disableTwoFactor).not.toHaveBeenCalled();
    });
  });

  describe("regenerating backup codes", () => {
    it("confirms via modal, shows the new codes without the 'now enabled' banner, and returns to idle-on when done", async () => {
      mockAuth(true);
      vi.mocked(regenerateBackupCodes).mockResolvedValue({ backup_codes: ["ZZZZ-9999"] });

      render(<TwoFactorSetupView />);
      fireEvent.click(screen.getByRole("button", { name: "Regenerate Backup Codes" }));

      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Regenerate" }));

      await waitFor(() => expect(regenerateBackupCodes).toHaveBeenCalled());
      expect(await screen.findByText("ZZZZ-9999")).toBeInTheDocument();
      expect(screen.queryByText("Two-factor authentication is now enabled for your account.")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "I've saved these codes" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Regenerate Backup Codes" })).toBeInTheDocument());
    });

    it("cancelling the modal makes no API call", async () => {
      mockAuth(true);
      render(<TwoFactorSetupView />);
      fireEvent.click(screen.getByRole("button", { name: "Regenerate Backup Codes" }));

      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(regenerateBackupCodes).not.toHaveBeenCalled();
    });

    it("shows the backend error and keeps the modal open on failure", async () => {
      mockAuth(true);
      vi.mocked(regenerateBackupCodes).mockRejectedValue({
        isAxiosError: true,
        response: { data: { detail: "Failed to regenerate backup codes" } },
      });

      render(<TwoFactorSetupView />);
      fireEvent.click(screen.getByRole("button", { name: "Regenerate Backup Codes" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Regenerate" }));

      expect(await within(dialog).findByText("Failed to regenerate backup codes")).toBeInTheDocument();
    });
  });
});
