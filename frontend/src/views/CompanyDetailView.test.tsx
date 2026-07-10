import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/companies", () => ({
  getCompany: vi.fn(),
  updateCompany: vi.fn(),
  deleteCompany: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/companies/CompanyLogoUploader", () => ({
  CompanyLogoUploader: () => <div>Logo uploader</div>,
}));

import { deleteCompany, getCompany, updateCompany } from "@/api/companies";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import type { Company } from "@/types/company";
import { CompanyDetailView } from "@/views/CompanyDetailView";

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    organization_id: "org-1",
    name: "Senus PLC",
    industry: "Natural Capital Software",
    fiscal_year_end: "06-30",
    currency: "EUR",
    reporting_frequency: "half_yearly",
    fiscal_year_start_month: 7,
    investor_relations_url: null,
    auto_fetch_enabled: false,
    last_fetch_checked_at: null,
    last_fetch_result: null,
    description: null,
    founded_date: null,
    website_url: null,
    headquarters_location: null,
    employee_count_range: null,
    logo_url: null,
    ...overrides,
  };
}

function mockAuth(role: UserRole) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "user-1", role },
  } as unknown as ReturnType<typeof useAuth>);
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/companies/company-1"]}>
      <Routes>
        <Route path="/companies/:companyId" element={<CompanyDetailView />} />
        <Route path="/companies" element={<div>Companies List Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

describe("CompanyDetailView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(updateCompany).mockReset();
    vi.mocked(deleteCompany).mockReset();
  });

  it("loads and displays company info and profile details", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(
      company({
        description: "Natural capital management software.",
        founded_date: "2017-03-01",
        website_url: "https://senus.example",
        headquarters_location: "Dublin, Ireland",
        employee_count_range: "50-100 employees",
      }),
    );

    renderView();
    await waitForLoaded();

    expect(screen.getByRole("heading", { name: "Senus PLC" })).toBeInTheDocument();
    expect(screen.getByText(/Natural Capital Software · EUR/)).toBeInTheDocument();
    expect(screen.getByText("Natural capital management software.")).toBeInTheDocument();
    expect(screen.getByText("Dublin, Ireland")).toBeInTheDocument();
    expect(screen.getByText("50-100 employees")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://senus.example" })).toHaveAttribute(
      "href",
      "https://senus.example",
    );
  });

  it("shows a manage hint when there are no profile details yet and the user can manage", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());

    renderView();
    await waitForLoaded();

    expect(screen.getByText(/Click Edit to add a description/i)).toBeInTheDocument();
  });

  it("omits the manage hint for a viewer", async () => {
    mockAuth("viewer");
    vi.mocked(getCompany).mockResolvedValue(company());

    renderView();
    await waitForLoaded();

    expect(screen.getByText("No additional company details yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Click Edit to add a description/i)).not.toBeInTheDocument();
  });

  it("shows a load error instead of the page when the fetch fails", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockRejectedValue(new Error("boom"));

    renderView();

    expect(await screen.findByText("Failed to load company")).toBeInTheDocument();
  });

  describe("permission gating", () => {
    it("disables Edit/Delete for a viewer and explains why", async () => {
      mockAuth("viewer");
      vi.mocked(getCompany).mockResolvedValue(company());
      renderView();
      await waitForLoaded();

      const editButton = screen.getByRole("button", { name: /edit/i });
      const deleteButton = screen.getByRole("button", { name: /delete/i });
      expect(editButton).toBeDisabled();
      expect(deleteButton).toBeDisabled();
      expect(editButton).toHaveAttribute("title", "Only an Owner or Admin can edit this company");
    });

    it("shows the Budget tile for analysts but not the Benchmarks tile", async () => {
      mockAuth("analyst");
      vi.mocked(getCompany).mockResolvedValue(company());
      renderView();
      await waitForLoaded();

      expect(screen.getByRole("link", { name: /Budget/i })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Benchmarks/i })).not.toBeInTheDocument();
    });

    it("shows neither Budget nor Benchmarks for a viewer, but shows both for an owner", async () => {
      mockAuth("viewer");
      vi.mocked(getCompany).mockResolvedValue(company());
      const { unmount } = renderView();
      await waitForLoaded();
      expect(screen.queryByRole("link", { name: /Budget/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Benchmarks/i })).not.toBeInTheDocument();
      unmount();

      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      renderView();
      await waitForLoaded();
      expect(screen.getByRole("link", { name: /Budget/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Benchmarks/i })).toBeInTheDocument();
    });
  });

  describe("editing", () => {
    it("pre-fills the edit modal from the loaded company and saves changes", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company({ industry: "Software" }));
      vi.mocked(updateCompany).mockResolvedValue(company({ name: "Senus Group", industry: "Software" }));

      renderView();
      await waitForLoaded();
      fireEvent.click(screen.getByRole("button", { name: /edit/i }));

      const nameInput = screen.getByLabelText("Company Name") as HTMLInputElement;
      expect(nameInput.value).toBe("Senus PLC");

      fireEvent.change(nameInput, { target: { value: "Senus Group" } });
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      await waitFor(() =>
        expect(updateCompany).toHaveBeenCalledWith(
          "company-1",
          expect.objectContaining({ name: "Senus Group", industry: "Software" }),
        ),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByRole("heading", { name: "Senus Group" })).toBeInTheDocument();
    });

    it("disables Save Changes when the name is blank", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      renderView();
      await waitForLoaded();
      fireEvent.click(screen.getByRole("button", { name: /edit/i }));

      fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: "   " } });

      expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    });

    it("shows the backend error and keeps the modal open on save failure", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(updateCompany).mockRejectedValue({
        isAxiosError: true,
        response: { data: { detail: "Name already in use" } },
      });
      renderView();
      await waitForLoaded();
      fireEvent.click(screen.getByRole("button", { name: /edit/i }));
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      expect(await screen.findByText("Name already in use")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("cancel discards changes without calling the API", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      renderView();
      await waitForLoaded();
      fireEvent.click(screen.getByRole("button", { name: /edit/i }));

      fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: "Something Else" } });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(updateCompany).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Senus PLC" })).toBeInTheDocument();
    });
  });

  describe("deleting", () => {
    it("deletes the company and navigates to the company list", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(deleteCompany).mockResolvedValue(undefined);
      renderView();
      await waitForLoaded();

      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("Senus PLC");
      fireEvent.click(screen.getByRole("button", { name: "Delete Company" }));

      await waitFor(() => expect(deleteCompany).toHaveBeenCalledWith("company-1"));
      expect(await screen.findByText("Companies List Page")).toBeInTheDocument();
    });

    it("shows the backend error and keeps the modal open on delete failure", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(deleteCompany).mockRejectedValue({
        isAxiosError: true,
        response: { data: { detail: "Cannot delete company with active users" } },
      });
      renderView();
      await waitForLoaded();

      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      await screen.findByRole("dialog");
      fireEvent.click(screen.getByRole("button", { name: "Delete Company" }));

      expect(await screen.findByText("Cannot delete company with active users")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
