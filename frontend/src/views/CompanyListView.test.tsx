import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/companies", () => ({ listCompanies: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { listCompanies } from "@/api/companies";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import type { Company } from "@/types/company";
import { CompanyListView } from "@/views/CompanyListView";

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    organization_id: "org-1",
    name: "Senus PLC",
    industry: "Software",
    fiscal_year_end: "06-30",
    currency: "EUR",
    reporting_frequency: null,
    fiscal_year_start_month: 1,
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
    <MemoryRouter initialEntries={["/companies"]}>
      <Routes>
        <Route path="/companies" element={<CompanyListView />} />
        <Route path="/companies/new" element={<div>Create Company Page</div>} />
        <Route path="/companies/:companyId" element={<div>Company Detail Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CompanyListView", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockReset();
  });

  it("shows an empty state when there are no companies", async () => {
    mockAuth("owner");
    vi.mocked(listCompanies).mockResolvedValue([]);
    renderView();

    expect(await screen.findByText(/No companies added yet/i)).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    mockAuth("owner");
    vi.mocked(listCompanies).mockRejectedValue(new Error("boom"));
    renderView();

    expect(await screen.findByText("Failed to load company list")).toBeInTheDocument();
  });

  it("lists companies and links each to its detail page", async () => {
    mockAuth("owner");
    vi.mocked(listCompanies).mockResolvedValue([
      company(),
      company({ id: "company-2", name: "Other Co", industry: null, headquarters_location: "Cork, Ireland" }),
    ]);
    renderView();

    expect(await screen.findByText("Senus PLC")).toBeInTheDocument();
    expect(screen.getByText(/Software · EUR/)).toBeInTheDocument();
    expect(screen.getByText("Industry not set · EUR")).toBeInTheDocument();
    expect(screen.getByText("Cork, Ireland")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /Other Co/ }));
    expect(await screen.findByText("Company Detail Page")).toBeInTheDocument();
  });

  it("disables Add Company for a non-manager with an explanatory title", async () => {
    mockAuth("analyst");
    vi.mocked(listCompanies).mockResolvedValue([]);
    renderView();
    await screen.findByText(/No companies added yet/i);

    const addButton = screen.getByRole("button", { name: "Add Company" });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAttribute("title", "Only an Owner or Admin can add a company");
  });

  it("navigates to the create-company page for a manager", async () => {
    mockAuth("owner");
    vi.mocked(listCompanies).mockResolvedValue([]);
    renderView();
    await screen.findByText(/No companies added yet/i);

    fireEvent.click(screen.getByRole("button", { name: "Add Company" }));

    expect(await screen.findByText("Create Company Page")).toBeInTheDocument();
  });
});
