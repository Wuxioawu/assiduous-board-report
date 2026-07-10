import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/budgets", () => ({ listBudgets: vi.fn(), setBudgets: vi.fn() }));
vi.mock("@/api/companies", () => ({ getCompany: vi.fn(), getCompanyPeriods: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { listBudgets, setBudgets } from "@/api/budgets";
import { getCompany, getCompanyPeriods } from "@/api/companies";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import type { BudgetEntry } from "@/types/budget";
import type { Company, CompanyPeriod } from "@/types/company";
import { BudgetEditView } from "@/views/BudgetEditView";

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
  return { period_start: "2024-07-01", period_end: "2025-06-30", fiscal_label: "FY2025 H2", ...overrides };
}

function budgetEntry(overrides: Partial<BudgetEntry> = {}): BudgetEntry {
  return {
    id: "budget-1",
    company_id: "company-1",
    taxonomy_code: "REVENUE",
    value: 500000,
    currency: "EUR",
    period_start: "2024-07-01",
    period_end: "2025-06-30",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockAuth(role: UserRole) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "user-1", role } } as unknown as ReturnType<typeof useAuth>);
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/companies/company-1/budget/2025-06-30/edit"]}>
      <Routes>
        <Route path="/companies/:companyId/budget/:period/edit" element={<BudgetEditView />} />
        <Route path="/companies/:companyId/budget" element={<div>Budget Settings Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BudgetEditView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(getCompanyPeriods).mockReset();
    vi.mocked(listBudgets).mockReset();
    vi.mocked(setBudgets).mockReset();
  });

  it("redirects a non-editor to the budget settings page", async () => {
    mockAuth("viewer");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(listBudgets).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText("Budget Settings Page")).toBeInTheDocument();
  });

  it("pre-fills existing values for the period being edited", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(listBudgets).mockResolvedValue([
      budgetEntry({ taxonomy_code: "REVENUE", value: 500000 }),
      budgetEntry({ id: "budget-2", taxonomy_code: "EBITDA", value: 120000 }),
    ]);

    renderView();

    expect(await screen.findByDisplayValue("500000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("120000")).toBeInTheDocument();
    expect(screen.getByText("FY2025 H2")).toBeInTheDocument();
  });

  it("shows an error when the period no longer exists", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([]);
    vi.mocked(listBudgets).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText("This budget period no longer exists.")).toBeInTheDocument();
  });

  it("saves updated values and navigates back", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(listBudgets).mockResolvedValue([budgetEntry({ value: 500000 })]);
    vi.mocked(setBudgets).mockResolvedValue([]);

    renderView();
    const revenueInput = await screen.findByDisplayValue("500000");
    fireEvent.change(revenueInput, { target: { value: "600000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Budget" }));

    await waitFor(() =>
      expect(setBudgets).toHaveBeenCalledWith("company-1", "2024-07-01", "2025-06-30", [
        { taxonomy_code: "REVENUE", value: 600000, currency: "EUR" },
      ]),
    );
    expect(await screen.findByText("Budget Settings Page")).toBeInTheDocument();
  });

  it("shows a load error when the initial fetch fails", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockRejectedValue(new Error("boom"));
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(listBudgets).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText("Failed to load this budget")).toBeInTheDocument();
  });
});
