import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/auth", () => ({ changePassword: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import * as authApi from "@/api/auth";
import { ChangePasswordView } from "@/views/ChangePasswordView";

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/account/change-password"]}>
      <Routes>
        <Route path="/account/change-password" element={<ChangePasswordView />} />
        <Route path="/companies" element={<div>Companies Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ChangePasswordView", () => {
  beforeEach(() => {
    vi.mocked(authApi.changePassword).mockReset();
  });

  it("reveals Back to Account only after a successful update", async () => {
    vi.mocked(authApi.changePassword).mockResolvedValue({ message: "Password updated successfully" });
    renderView();

    expect(screen.queryByRole("button", { name: "Back to Account" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "old-password1" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "new-password1" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "new-password1" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByText("Password updated successfully")).toBeInTheDocument();
    const backButton = screen.getByRole("button", { name: "Back to Account" });

    fireEvent.click(backButton);
    expect(await screen.findByText("Companies Page")).toBeInTheDocument();
  });

  it("does not reveal Back to Account when the update fails", async () => {
    vi.mocked(authApi.changePassword).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Current password is incorrect" } },
    });
    renderView();

    fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "wrong" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "new-password1" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "new-password1" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to Account" })).not.toBeInTheDocument();
  });

  it("blocks submission client-side when the new passwords don't match, without calling the API", () => {
    renderView();

    fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "old-password1" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "new-password1" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    expect(screen.getByText("New Password and Confirm New Password do not match")).toBeInTheDocument();
    expect(authApi.changePassword).not.toHaveBeenCalled();
  });
});
