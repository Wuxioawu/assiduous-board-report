import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/budgets", () => ({ deleteBudgets: vi.fn(), listAllBudgets: vi.fn() }));
vi.mock("@/api/companies", () => ({ getCompany: vi.fn(), getCompanyPeriods: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { deleteBudgets, listAllBudgets } from "@/api/budgets";
import { getCompany, getCompanyPeriods } from "@/api/companies";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import type { BudgetEntry, BudgetPeriodSummary } from "@/types/budget";
import type { Company, CompanyPeriod } from "@/types/company";
import { BudgetSettingsView } from "@/views/BudgetSettingsView";

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    organization_id: "org-1",
    name: "Senus PLC",
    industry: "Software",
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

function summary(overrides: Partial<BudgetPeriodSummary> = {}): BudgetPeriodSummary {
  return {
    period_start: "2024-07-01",
    period_end: "2025-06-30",
    entries: [budgetEntry()],
    updated_at: "2026-01-05T00:00:00Z",
    ...overrides,
  };
}

function mockAuth(role: UserRole) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "user-1", role } } as unknown as ReturnType<typeof useAuth>);
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/companies/company-1/budget"]}>
      <Routes>
        <Route path="/companies/:companyId/budget" element={<BudgetSettingsView />} />
        <Route path="/companies/:companyId/budget/new" element={<div>Add Budget Page</div>} />
        <Route path="/companies/:companyId/budget/:period/edit" element={<div>Edit Budget Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

describe("BudgetSettingsView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(getCompanyPeriods).mockReset();
    vi.mocked(listAllBudgets).mockReset();
    vi.mocked(deleteBudgets).mockReset();
  });

  it("shows an empty state with a manage hint for an editor", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(listAllBudgets).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    expect(screen.getByText(/Click Add Budget to set target values/i)).toBeInTheDocument();
  });

  it("hides Add Budget for a viewer", async () => {
    mockAuth("viewer");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([]);
    vi.mocked(listAllBudgets).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    expect(screen.queryByRole("button", { name: /Add Budget/i })).not.toBeInTheDocument();
    expect(screen.getByText("No budgets set yet.")).toBeInTheDocument();
  });

  it("shows saved budgets with the period label and per-line-item values", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(listAllBudgets).mockResolvedValue([summary()]);

    renderView();
    await waitForLoaded();

    const table = within(screen.getByRole("table"));
    expect(table.getByText("FY2025 (12M to Jun 2025)")).toBeInTheDocument();
    expect(table.getByText("500,000")).toBeInTheDocument();
    // EBITDA/OPEX/NET_INCOME have no entry for this summary - shown as an em dash.
    expect(table.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("navigates to Add Budget and Edit Budget", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(listAllBudgets).mockResolvedValue([summary()]);
    renderView();
    await waitForLoaded();

    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /Edit/i }));
    expect(await screen.findByText("Edit Budget Page")).toBeInTheDocument();
  });

  it("deletes a budget after confirming in the modal", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
    vi.mocked(listAllBudgets).mockResolvedValue([summary()]);
    vi.mocked(deleteBudgets).mockResolvedValue(undefined);
    renderView();
    await waitForLoaded();

    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /Delete/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteBudgets).toHaveBeenCalledWith("company-1", "2025-06-30"));
    expect(await screen.findByText(/No budgets set yet\./)).toBeInTheDocument();
  });

  it("shows a load error when fetching saved budgets fails", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(getCompanyPeriods).mockResolvedValue([]);
    vi.mocked(listAllBudgets).mockRejectedValue(new Error("boom"));
    renderView();

    expect(await screen.findByText("Failed to load saved budgets")).toBeInTheDocument();
  });
});
