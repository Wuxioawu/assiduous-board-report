import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/budgets", () => ({ setBudgets: vi.fn() }));
vi.mock("@/api/companies", () => ({ getCompany: vi.fn(), getCompanyPeriods: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { setBudgets } from "@/api/budgets";
import { getCompany, getCompanyPeriods } from "@/api/companies";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import type { Company, CompanyPeriod } from "@/types/company";
import { BudgetCreateView } from "@/views/BudgetCreateView";

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

function period(overrides: Partial<CompanyPeriod> = {}): CompanyPeriod {
  return {
    period_start: "2024-07-01",
    period_end: "2025-06-30",
    period_type: "FY",
    fiscal_year: 2025,
    fiscal_quarter: null,
    ...overrides,
  };
}

function mockAuth(role: UserRole) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "user-1", role } } as unknown as ReturnType<typeof useAuth>);
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/companies/company-1/budget/new"]}>
      <Routes>
        <Route path="/companies/:companyId/budget/new" element={<BudgetCreateView />} />
        <Route path="/companies/:companyId/budget" element={<div>Budget Settings Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BudgetCreateView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(getCompanyPeriods).mockReset();
    vi.mocked(setBudgets).mockReset();
  });

  it("redirects a non-editor to the budget settings page", async () => {
    mockAuth("viewer");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);

    renderView();

    expect(await screen.findByText("Budget Settings Page")).toBeInTheDocument();
  });

  it("shows a hint instead of the form when there are no reporting periods yet", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText(/upload a document for this company first/i)).toBeInTheDocument();
  });

  it("blocks saving with no values entered, without calling the API", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    renderView();
    await screen.findByRole("button", { name: "Save Budget" });

    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));

    expect(
      await screen.findByText("Enter at least one budget value before saving"),
    ).toBeInTheDocument();
    expect(setBudgets).not.toHaveBeenCalled();
  });

  it("saves entered line items for the selected period and navigates back", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(setBudgets).mockResolvedValue([]);
    renderView();
    await screen.findByLabelText("Revenue");

    fireEvent.change(screen.getByLabelText("Revenue"), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText("EBITDA"), { target: { value: "120000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));

    await waitFor(() =>
      expect(setBudgets).toHaveBeenCalledWith("company-1", "2024-07-01", "2025-06-30", [
        { taxonomy_code: "REVENUE", value: 500000, currency: "EUR" },
        { taxonomy_code: "EBITDA", value: 120000, currency: "EUR" },
      ]),
    );
    expect(await screen.findByText("Budget Settings Page")).toBeInTheDocument();
  });

  it("shows the backend error and stays on the page on save failure", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(setBudgets).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Budget already exists for this period" } },
    });
    renderView();
    await screen.findByLabelText("Revenue");

    fireEvent.change(screen.getByLabelText("Revenue"), { target: { value: "500000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));

    expect(await screen.findByText("Budget already exists for this period")).toBeInTheDocument();
  });
});
