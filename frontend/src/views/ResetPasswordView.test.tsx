import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/auth", () => ({ resetPassword: vi.fn() }));

import * as authApi from "@/api/auth";
import { ResetPasswordView } from "@/views/ResetPasswordView";

function renderView(search = "?token=reset-token-123") {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordView />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillMatchingPasswords(value = "new-password1") {
  fireEvent.change(screen.getByLabelText("New Password"), { target: { value } });
  fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value } });
}

describe("ResetPasswordView", () => {
  beforeEach(() => {
    vi.mocked(authApi.resetPassword).mockReset();
  });

  it("reads the token from the URL and redirects to /login with a success message", async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue({ message: "Password reset successfully." });
    renderView("?token=reset-token-123");

    fillMatchingPasswords();
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    await waitFor(() =>
      expect(authApi.resetPassword).toHaveBeenCalledWith({
        token: "reset-token-123",
        new_password: "new-password1",
      }),
    );
    expect(await screen.findByText("Login Page")).toBeInTheDocument();
  });

  it("blocks submission client-side when the passwords don't match", () => {
    renderView();

    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "new-password1" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "different1" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(screen.getByText("New Password and Confirm New Password do not match")).toBeInTheDocument();
    expect(authApi.resetPassword).not.toHaveBeenCalled();
  });

  it("shows the backend error detail and a link to request a new one when the token is invalid", async () => {
    vi.mocked(authApi.resetPassword).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "This reset link is invalid or has expired. Please request a new one." } },
    });
    renderView();

    fillMatchingPasswords();
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(
      await screen.findByText(/This reset link is invalid or has expired/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("submits an empty token when the URL has none, rather than skipping the request", async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue({ message: "ok" });
    renderView("");

    fillMatchingPasswords();
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    await waitFor(() =>
      expect(authApi.resetPassword).toHaveBeenCalledWith({ token: "", new_password: "new-password1" }),
    );
  });
});
