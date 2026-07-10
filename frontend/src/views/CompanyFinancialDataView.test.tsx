import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/companies", () => ({ getCompany: vi.fn(), getCompanyPeriods: vi.fn() }));
vi.mock("@/api/financialStatements", () => ({
  listFinancialStatements: vi.fn(),
  createFinancialStatement: vi.fn(),
  updateFinancialStatement: vi.fn(),
  getFinancialStatementHistory: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { getCompany, getCompanyPeriods } from "@/api/companies";
import {
  createFinancialStatement,
  getFinancialStatementHistory,
  listFinancialStatements,
  updateFinancialStatement,
} from "@/api/financialStatements";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import type { Company, CompanyPeriod } from "@/types/company";
import type { FinancialStatement } from "@/types/financialStatement";
import { CompanyFinancialDataView } from "@/views/CompanyFinancialDataView";

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
  return { period_start: "2024-07-01", period_end: "2025-06-30", fiscal_label: "FY2025 H2", ...overrides };
}

function statement(overrides: Partial<FinancialStatement> = {}): FinancialStatement {
  return {
    id: "fs-1",
    company_id: "company-1",
    document_id: "doc-1",
    taxonomy_code: "REVENUE",
    value: 836991,
    currency: "EUR",
    period_start: "2024-07-01",
    period_end: "2025-06-30",
    confidence_score: 0.95,
    source_excerpt: "Revenue was EUR 836,991",
    source_page: 3,
    extracted_by: "ai",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockAuth(role: UserRole) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "user-1", role } } as unknown as ReturnType<typeof useAuth>);
}

function renderView(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/companies/company-1/documents/financial-data${search}`]}>
      <Routes>
        <Route path="/companies/:companyId/documents/financial-data" element={<CompanyFinancialDataView />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

function table() {
  return within(screen.getByRole("table"));
}

describe("CompanyFinancialDataView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(getCompanyPeriods).mockReset();
    vi.mocked(listFinancialStatements).mockReset();
    vi.mocked(createFinancialStatement).mockReset();
    vi.mocked(updateFinancialStatement).mockReset();
    vi.mocked(getFinancialStatementHistory).mockReset();
    vi.mocked(getCompanyPeriods).mockResolvedValue([period()]);
  });

  it("shows an empty state when there is no financial data yet", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listFinancialStatements).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    expect(screen.getByText(/No financial data extracted yet/i)).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listFinancialStatements).mockRejectedValue(new Error("boom"));

    renderView();

    expect(await screen.findByText("Failed to load financial statements")).toBeInTheDocument();
  });

  it("displays statements with taxonomy code, value, currency, and confidence", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listFinancialStatements).mockResolvedValue([statement()]);

    renderView();
    await waitForLoaded();

    expect(table().getByText("REVENUE")).toBeInTheDocument();
    expect(table().getByText("836,991")).toBeInTheDocument();
    expect(table().getByText("95%")).toBeInTheDocument();
  });

  it("hides Add Missing Line Item and Edit for a non-editor, keeps History visible", async () => {
    mockAuth("viewer");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listFinancialStatements).mockResolvedValue([statement({ extracted_by: "manual_override" })]);

    renderView();
    await waitForLoaded();

    expect(screen.queryByRole("button", { name: /Add Missing Line Item/i })).not.toBeInTheDocument();
    expect(table().queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(table().getByRole("button", { name: "History" })).toBeInTheDocument();
  });

  describe("filtering", () => {
    async function renderWithMixedStatements() {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(getCompanyPeriods).mockResolvedValue([
        period(),
        period({ period_start: "2023-07-01", period_end: "2024-06-30", fiscal_label: "FY2024 H2" }),
      ]);
      vi.mocked(listFinancialStatements).mockResolvedValue([
        statement({ id: "fs-1", taxonomy_code: "REVENUE", extracted_by: "ai" }),
        statement({
          id: "fs-2",
          taxonomy_code: "EBITDA",
          extracted_by: "manual_entry",
          period_start: "2023-07-01",
          period_end: "2024-06-30",
        }),
      ]);
      renderView();
      await waitForLoaded();
    }

    it("filters by search text against the taxonomy code", async () => {
      await renderWithMixedStatements();

      fireEvent.change(screen.getByLabelText("Search financial data"), { target: { value: "ebitda" } });

      await waitFor(() => expect(table().queryByText("REVENUE")).not.toBeInTheDocument());
      expect(table().getByText("EBITDA")).toBeInTheDocument();
      expect(screen.getByText("Showing 1 of 2 line items")).toBeInTheDocument();
    });

    it("filters by period", async () => {
      await renderWithMixedStatements();

      fireEvent.change(screen.getByLabelText("Filter by period"), { target: { value: "2023-07-01|2024-06-30" } });

      expect(table().getByText("EBITDA")).toBeInTheDocument();
      expect(table().queryByText("REVENUE")).not.toBeInTheDocument();
    });

    it("filters by source type", async () => {
      await renderWithMixedStatements();

      fireEvent.click(screen.getByRole("button", { name: "Manually Added" }));

      expect(table().getByText("EBITDA")).toBeInTheDocument();
      expect(table().queryByText("REVENUE")).not.toBeInTheDocument();
    });

    it("shows a filtered-empty state with a working Clear filters action", async () => {
      await renderWithMixedStatements();

      fireEvent.change(screen.getByLabelText("Search financial data"), { target: { value: "no-such-code" } });
      expect(await screen.findByText("No line items match your filters.")).toBeInTheDocument();

      // Two "Clear filters" buttons are visible at once here: the toolbar link
      // and the one inside the filtered-empty-state card - use the latter.
      const emptyStateCard = screen.getByText("No line items match your filters.").closest("div")!;
      fireEvent.click(within(emptyStateCard).getByRole("button", { name: "Clear filters" }));

      await waitFor(() => expect(table().getByText("REVENUE")).toBeInTheDocument());
      expect(table().getByText("EBITDA")).toBeInTheDocument();
    });
  });

  describe("editing a value", () => {
    it("requires a valid number before showing the override confirmation", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(listFinancialStatements).mockResolvedValue([statement()]);
      renderView();
      await waitForLoaded();

      fireEvent.click(table().getByRole("button", { name: "Edit" }));
      const input = table().getByRole("spinbutton");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.click(table().getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Enter a valid number")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("confirms and saves an override, updating the table", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(listFinancialStatements).mockResolvedValue([statement()]);
      vi.mocked(updateFinancialStatement).mockResolvedValue(statement({ value: 900000, extracted_by: "manual_override" }));
      renderView();
      await waitForLoaded();

      fireEvent.click(table().getByRole("button", { name: "Edit" }));
      fireEvent.change(table().getByRole("spinbutton"), { target: { value: "900000" } });
      fireEvent.click(table().getByRole("button", { name: "Save" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("900,000")).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Override" }));

      await waitFor(() => expect(updateFinancialStatement).toHaveBeenCalledWith("fs-1", 900000));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(table().getByText("900,000")).toBeInTheDocument();
    });

    it("shows an error and stays in edit mode (with the attempted value) if saving the override fails", async () => {
      // confirmOverride's catch clears pendingOverride but deliberately leaves
      // editingId/editValue alone - the row stays in edit mode with what the
      // user typed still in the box, so they can retry without retyping it,
      // rather than silently reverting to the pre-edit value.
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(listFinancialStatements).mockResolvedValue([statement()]);
      vi.mocked(updateFinancialStatement).mockRejectedValue(new Error("network error"));
      renderView();
      await waitForLoaded();

      fireEvent.click(table().getByRole("button", { name: "Edit" }));
      fireEvent.change(table().getByRole("spinbutton"), { target: { value: "900000" } });
      fireEvent.click(table().getByRole("button", { name: "Save" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Override" }));

      expect(await screen.findByText("Failed to save the corrected value")).toBeInTheDocument();
      expect(table().getByRole("spinbutton")).toHaveValue(900000);
    });
  });

  describe("viewing override history", () => {
    it("loads and shows entries for a manually-overridden statement", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(listFinancialStatements).mockResolvedValue([statement({ extracted_by: "manual_override" })]);
      vi.mocked(getFinancialStatementHistory).mockResolvedValue([
        {
          id: "hist-1",
          previous_value: 800000,
          new_value: 836991,
          changed_by_user_id: "user-1",
          changed_at: "2026-01-02T00:00:00Z",
        },
      ]);
      renderView();
      await waitForLoaded();

      fireEvent.click(table().getByRole("button", { name: "History" }));

      expect(await screen.findByText(/AI: 800,000/)).toBeInTheDocument();
      expect(screen.getByText(/Manual: 836,991/)).toBeInTheDocument();
      expect(getFinancialStatementHistory).toHaveBeenCalledWith("fs-1");
    });

    it("shows an error if history fails to load", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(listFinancialStatements).mockResolvedValue([statement({ extracted_by: "manual_override" })]);
      vi.mocked(getFinancialStatementHistory).mockRejectedValue(new Error("boom"));
      renderView();
      await waitForLoaded();

      fireEvent.click(table().getByRole("button", { name: "History" }));

      expect(await screen.findByText("Failed to load override history")).toBeInTheDocument();
    });
  });

  describe("adding a missing line item", () => {
    it("pre-fills the company currency and first period, and creates the line item", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company({ currency: "GBP" }));
      vi.mocked(listFinancialStatements).mockResolvedValue([statement()]);
      vi.mocked(createFinancialStatement).mockResolvedValue(
        statement({ id: "fs-new", taxonomy_code: "EBITDA", value: 120000, extracted_by: "manual_entry" }),
      );
      renderView();
      await waitForLoaded();

      fireEvent.click(screen.getByRole("button", { name: /Add Missing Line Item/i }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByDisplayValue("GBP")).toBeInTheDocument();

      fireEvent.change(within(dialog).getByLabelText("Taxonomy Code"), { target: { value: "EBITDA" } });
      fireEvent.change(within(dialog).getByLabelText("Value"), { target: { value: "120000" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Add Line Item" }));

      await waitFor(() =>
        expect(createFinancialStatement).toHaveBeenCalledWith("company-1", {
          taxonomy_code: "EBITDA",
          value: 120000,
          currency: "GBP",
          period_start: "2024-07-01",
          period_end: "2025-06-30",
          source_note: null,
        }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(table().getByText("EBITDA")).toBeInTheDocument();
    });

    it("excludes taxonomy codes already present for the selected period", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(listFinancialStatements).mockResolvedValue([statement({ taxonomy_code: "REVENUE" })]);
      renderView();
      await waitForLoaded();

      fireEvent.click(screen.getByRole("button", { name: /Add Missing Line Item/i }));
      const dialog = await screen.findByRole("dialog");

      expect(within(dialog).queryByText("Revenue (REVENUE)")).not.toBeInTheDocument();
      expect(within(dialog).getByText("EBITDA (EBITDA)")).toBeInTheDocument();
    });

    it("shows the backend error on create failure", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(listFinancialStatements).mockResolvedValue([statement()]);
      vi.mocked(createFinancialStatement).mockRejectedValue({
        isAxiosError: true,
        response: { data: { detail: "A line item for this taxonomy code and period already exists" } },
      });
      renderView();
      await waitForLoaded();

      fireEvent.click(screen.getByRole("button", { name: /Add Missing Line Item/i }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.change(within(dialog).getByLabelText("Taxonomy Code"), { target: { value: "EBITDA" } });
      fireEvent.change(within(dialog).getByLabelText("Value"), { target: { value: "1" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Add Line Item" }));

      expect(
        await within(dialog).findByText("A line item for this taxonomy code and period already exists"),
      ).toBeInTheDocument();
    });

    it("opens pre-filled from deep-link URL params and strips them from the URL", async () => {
      mockAuth("owner");
      vi.mocked(getCompany).mockResolvedValue(company());
      vi.mocked(listFinancialStatements).mockResolvedValue([statement({ taxonomy_code: "REVENUE" })]);

      renderView("?addTaxonomyCode=EBITDA&addPeriodStart=2024-07-01&addPeriodEnd=2025-06-30");
      await waitForLoaded();

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByDisplayValue("EBITDA (EBITDA)")).toBeInTheDocument();
    });
  });
});
