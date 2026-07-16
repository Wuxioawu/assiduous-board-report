import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/hooks/useAuth";
import { LoginView } from "@/views/LoginView";

const login = vi.fn();
const completeTwoFactorLogin = vi.fn();
const clearAuthMessage = vi.fn();

function mockAuth(overrides: Record<string, unknown> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    login,
    completeTwoFactorLogin,
    authMessage: null,
    clearAuthMessage,
    ...overrides,
  } as unknown as ReturnType<typeof useAuth>);
}

function renderView(initialEntry: string | { pathname: string; state?: unknown } = "/login") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route path="/companies" element={<div>Companies Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginView", () => {
  beforeEach(() => {
    login.mockReset();
    completeTwoFactorLogin.mockReset();
    clearAuthMessage.mockReset();
  });

  it("logs in and navigates to /companies when no 2FA is required", async () => {
    mockAuth();
    login.mockResolvedValue({ token: { access_token: "t" }, user: { id: "u1" } });

    renderView();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: "jane@example.com", password: "password123" }),
    );
    expect(await screen.findByText("Companies Page")).toBeInTheDocument();
  });

  it("shows a generic error message when login fails, without leaking the backend detail", async () => {
    mockAuth();
    login.mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "User is inactive" } },
    });

    renderView();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
    expect(screen.queryByText("User is inactive")).not.toBeInTheDocument();
    expect(
      screen.getByText("Access is invitation-based — contact your administrator.", { exact: false }),
    ).toBeInTheDocument();
  });

  it("shows the redirect message passed via router location state", () => {
    mockAuth();
    renderView({ pathname: "/login", state: { message: "Password reset - please log in." } });

    expect(screen.getByText("Password reset - please log in.")).toBeInTheDocument();
  });

  it("shows an authMessage banner and clears it when the form gains focus", () => {
    mockAuth({ authMessage: "Your role was changed to Admin. Please log in again to continue." });
    renderView();

    expect(
      screen.getByText("Your role was changed to Admin. Please log in again to continue."),
    ).toBeInTheDocument();

    fireEvent.focus(screen.getByLabelText("Email"));
    expect(clearAuthMessage).toHaveBeenCalled();
  });

  it("switches to the 2FA prompt when login requires it, and verifies with a TOTP code", async () => {
    mockAuth();
    login.mockResolvedValue({ requires_2fa: true, pending_token: "pending-abc" });
    completeTwoFactorLogin.mockResolvedValue(undefined);

    renderView();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByText("Two-Factor Verification")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(completeTwoFactorLogin).toHaveBeenCalledWith({
        pending_token: "pending-abc",
        totp_code: "123456",
      }),
    );
    expect(await screen.findByText("Companies Page")).toBeInTheDocument();
  });

  it("clears the entered code and shows an error on an invalid TOTP attempt", async () => {
    mockAuth();
    login.mockResolvedValue({ requires_2fa: true, pending_token: "pending-abc" });
    completeTwoFactorLogin.mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Invalid verification code." } },
    });

    renderView();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
    await screen.findByText("Two-Factor Verification");

    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Invalid verification code.")).toBeInTheDocument();
    await waitFor(() => expect((screen.getByLabelText("Digit 1 of 6") as HTMLInputElement).value).toBe(""));
  });

  it("switches to backup-code mode and submits with backup_code instead of totp_code", async () => {
    mockAuth();
    login.mockResolvedValue({ requires_2fa: true, pending_token: "pending-abc" });
    completeTwoFactorLogin.mockResolvedValue(undefined);

    renderView();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
    await screen.findByText("Two-Factor Verification");

    fireEvent.click(screen.getByRole("button", { name: /use a backup code instead/i }));
    fireEvent.change(screen.getByLabelText("Backup Code"), { target: { value: "AB12-CD34" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(completeTwoFactorLogin).toHaveBeenCalledWith({
        pending_token: "pending-abc",
        backup_code: "AB12-CD34",
      }),
    );
  });

  it("returns to the credentials form via Back to login", async () => {
    mockAuth();
    login.mockResolvedValue({ requires_2fa: true, pending_token: "pending-abc" });

    renderView();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
    await screen.findByText("Two-Factor Verification");

    // Two elements share the accessible name "Back to login" - the X icon
    // button (via aria-label) and this text button - so scope to the visible
    // text node rather than the ambiguous accessible-name query.
    fireEvent.click(screen.getByText("Back to login"));

    expect(screen.getByRole("heading", { name: "Log In" })).toBeInTheDocument();
    expect(completeTwoFactorLogin).not.toHaveBeenCalled();
  });

  it("disables Verify until all 6 TOTP digits are entered", async () => {
    mockAuth();
    login.mockResolvedValue({ requires_2fa: true, pending_token: "pending-abc" });

    renderView();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
    await screen.findByText("Two-Factor Verification");

    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Digit 1 of 6"), { target: { value: "12345" } });
    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
  });
});
