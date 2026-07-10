import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/auth", () => ({ previewInvitation: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

import * as authApi from "@/api/auth";
import { useAuth } from "@/hooks/useAuth";
import type { InvitationPreview } from "@/types/team";
import { AcceptInvitationView } from "@/views/AcceptInvitationView";

const acceptInvitation = vi.fn();
const acceptInvitationWithDeletion = vi.fn();

function mockAuth() {
  vi.mocked(useAuth).mockReturnValue({
    acceptInvitation,
    acceptInvitationWithDeletion,
  } as unknown as ReturnType<typeof useAuth>);
}

function newUserPreview(overrides: Partial<InvitationPreview> = {}): InvitationPreview {
  return {
    email: "new@example.com",
    organization_name: "Senus PLC",
    role: "viewer",
    invitation_type: "new_user",
    current_organization_name: null,
    ...overrides,
  };
}

function transferPreview(overrides: Partial<InvitationPreview> = {}): InvitationPreview {
  return {
    email: "existing@example.com",
    organization_name: "Senus PLC",
    role: "analyst",
    invitation_type: "transfer",
    current_organization_name: "UCD",
    ...overrides,
  };
}

function renderView(token: string | null = "invite-token-123") {
  const search = token === null ? "" : `?token=${token}`;
  return render(
    <MemoryRouter initialEntries={[`/accept-invitation${search}`]}>
      <Routes>
        <Route path="/accept-invitation" element={<AcceptInvitationView />} />
        <Route path="/companies" element={<div>Companies Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AcceptInvitationView", () => {
  beforeEach(() => {
    vi.mocked(authApi.previewInvitation).mockReset();
    acceptInvitation.mockReset();
    acceptInvitationWithDeletion.mockReset();
    mockAuth();
  });

  it("shows a missing-token message and never fetches a preview", () => {
    renderView(null);

    expect(
      screen.getByText(/This invitation link is missing its token/i),
    ).toBeInTheDocument();
    expect(authApi.previewInvitation).not.toHaveBeenCalled();
  });

  it("shows the invalid-token message when the preview fetch fails", async () => {
    vi.mocked(authApi.previewInvitation).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "This invitation link is invalid or has expired." } },
    });

    renderView();

    expect(await screen.findByText("This invitation link is invalid or has expired.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute("href", "/login");
  });

  describe("new-user invitation", () => {
    it("blocks submission client-side when passwords don't match", async () => {
      vi.mocked(authApi.previewInvitation).mockResolvedValue(newUserPreview());
      renderView();
      await screen.findByLabelText("Full Name");

      fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Jane Doe" } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
      fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "different1" } });
      fireEvent.click(screen.getByRole("button", { name: "Accept & Join" }));

      expect(screen.getByText("Password and Confirm Password do not match")).toBeInTheDocument();
      expect(acceptInvitation).not.toHaveBeenCalled();
    });

    it("accepts and navigates to /companies on success", async () => {
      vi.mocked(authApi.previewInvitation).mockResolvedValue(newUserPreview());
      acceptInvitation.mockResolvedValue(null);
      renderView();
      await screen.findByLabelText("Full Name");

      fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Jane Doe" } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
      fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: "Accept & Join" }));

      await waitFor(() =>
        expect(acceptInvitation).toHaveBeenCalledWith({
          token: "invite-token-123",
          full_name: "Jane Doe",
          password: "password123",
        }),
      );
      expect(await screen.findByText("Companies Page")).toBeInTheDocument();
    });

    it("shows the backend error on failure", async () => {
      vi.mocked(authApi.previewInvitation).mockResolvedValue(newUserPreview());
      acceptInvitation.mockRejectedValue({
        isAxiosError: true,
        response: { data: { detail: "An account with this email already exists" } },
      });
      renderView();
      await screen.findByLabelText("Full Name");

      fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Jane Doe" } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
      fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: "Accept & Join" }));

      expect(await screen.findByText("An account with this email already exists")).toBeInTheDocument();
    });
  });

  describe("transfer invitation", () => {
    it("only asks for the existing password, not a name or confirmation", async () => {
      vi.mocked(authApi.previewInvitation).mockResolvedValue(transferPreview());
      renderView();

      expect(await screen.findByText(/you currently have an account/i)).toBeInTheDocument();
      expect(screen.queryByLabelText("Full Name")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
    });

    it("submits with only token+password (no full_name) and navigates on success", async () => {
      vi.mocked(authApi.previewInvitation).mockResolvedValue(transferPreview());
      acceptInvitation.mockResolvedValue(null);
      renderView();
      await screen.findByLabelText("Password");

      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "existing-password" } });
      fireEvent.click(screen.getByRole("button", { name: "Log In & Transfer Account" }));

      await waitFor(() =>
        expect(acceptInvitation).toHaveBeenCalledWith({
          token: "invite-token-123",
          password: "existing-password",
        }),
      );
      expect(await screen.findByText("Companies Page")).toBeInTheDocument();
    });

    it("switches to the delete-and-transfer confirmation when the sole-member block comes back", async () => {
      vi.mocked(authApi.previewInvitation).mockResolvedValue(transferPreview({ current_organization_name: "UCD" }));
      acceptInvitation.mockResolvedValue({
        blocked: true,
        reason: "sole_member",
        can_delete_and_transfer: true,
        current_organization_name: "UCD",
      });
      renderView();
      await screen.findByLabelText("Password");

      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "existing-password" } });
      fireEvent.click(screen.getByRole("button", { name: "Log In & Transfer Account" }));

      expect(await screen.findByText(/you're the only member of/i)).toBeInTheDocument();
      const confirmButton = screen.getByRole("button", { name: /Delete UCD and Join Senus PLC/i });
      expect(confirmButton).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Type "UCD" to confirm'), { target: { value: "wrong name" } });
      expect(confirmButton).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Type "UCD" to confirm'), { target: { value: "UCD" } });
      expect(confirmButton).toBeEnabled();

      acceptInvitationWithDeletion.mockResolvedValue(undefined);
      fireEvent.click(confirmButton);

      await waitFor(() =>
        expect(acceptInvitationWithDeletion).toHaveBeenCalledWith({
          token: "invite-token-123",
          password: "existing-password",
          confirm_organization_name: "UCD",
        }),
      );
      expect(await screen.findByText("Companies Page")).toBeInTheDocument();
    });

    it("shows the backend error when the delete-and-transfer submission fails", async () => {
      vi.mocked(authApi.previewInvitation).mockResolvedValue(transferPreview({ current_organization_name: "UCD" }));
      acceptInvitation.mockResolvedValue({
        blocked: true,
        reason: "sole_member",
        can_delete_and_transfer: true,
        current_organization_name: "UCD",
      });
      acceptInvitationWithDeletion.mockRejectedValue({
        isAxiosError: true,
        response: { data: { detail: "Organization name confirmation does not match." } },
      });
      renderView();
      await screen.findByLabelText("Password");

      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "existing-password" } });
      fireEvent.click(screen.getByRole("button", { name: "Log In & Transfer Account" }));
      await screen.findByText(/you're the only member of/i);

      fireEvent.change(screen.getByLabelText('Type "UCD" to confirm'), { target: { value: "UCD" } });
      fireEvent.click(screen.getByRole("button", { name: /Delete UCD and Join Senus PLC/i }));

      expect(await screen.findByText("Organization name confirmation does not match.")).toBeInTheDocument();
    });
  });
});
