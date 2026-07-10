import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/hooks/useAuth";
import { RegisterView } from "@/views/RegisterView";

const register = vi.fn();

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <Routes>
        <Route path="/register" element={<RegisterView />} />
        <Route path="/companies" element={<div>Companies Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("Organization Name"), { target: { value: "Senus PLC" } });
  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Jane Doe" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jane@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
}

describe("RegisterView", () => {
  beforeEach(() => {
    register.mockReset();
    vi.mocked(useAuth).mockReturnValue({ register } as unknown as ReturnType<typeof useAuth>);
  });

  it("registers and navigates to /companies on success", async () => {
    register.mockResolvedValue(undefined);
    renderView();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        organization_name: "Senus PLC",
        full_name: "Jane Doe",
        email: "jane@example.com",
        password: "password123",
      }),
    );
    expect(await screen.findByText("Companies Page")).toBeInTheDocument();
  });

  it("shows a generic error on failure without leaking the backend detail", async () => {
    register.mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Email already registered" } },
    });
    renderView();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(
      await screen.findByText("Registration failed, please check your information or try a different email"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Email already registered")).not.toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolveRegister: () => void = () => {};
    register.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRegister = resolve;
      }),
    );
    renderView();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("button", { name: "Registering…" })).toBeDisabled();
    resolveRegister();
    await waitFor(() => expect(screen.getByText("Companies Page")).toBeInTheDocument());
  });
});
