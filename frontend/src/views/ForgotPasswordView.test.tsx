import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/auth", () => ({ forgotPassword: vi.fn() }));

import * as authApi from "@/api/auth";
import { ForgotPasswordView } from "@/views/ForgotPasswordView";

function renderView() {
  return render(
    <MemoryRouter>
      <ForgotPasswordView />
    </MemoryRouter>,
  );
}

describe("ForgotPasswordView", () => {
  beforeEach(() => {
    vi.mocked(authApi.forgotPassword).mockReset();
  });

  it("shows the backend's generic message after submitting", async () => {
    vi.mocked(authApi.forgotPassword).mockResolvedValue({
      message: "If an account with that email exists, a reset link has been sent.",
    });
    renderView();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(
      await screen.findByText("If an account with that email exists, a reset link has been sent."),
    ).toBeInTheDocument();
    expect(authApi.forgotPassword).toHaveBeenCalledWith({ email: "jane@example.com" });
    // The form itself is gone once the message shows - nothing left to resubmit.
    expect(screen.queryByRole("button", { name: "Send Reset Link" })).not.toBeInTheDocument();
  });

  it("shows the same generic message even when the request itself fails", async () => {
    // The endpoint is designed to never reveal whether an email is registered -
    // a network/server failure must degrade to the identical copy, not an error.
    vi.mocked(authApi.forgotPassword).mockRejectedValue(new Error("network down"));
    renderView();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(
      await screen.findByText("If an account with that email exists, a reset link has been sent."),
    ).toBeInTheDocument();
  });
});
