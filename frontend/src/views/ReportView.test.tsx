import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/companies", () => ({ getCompanyPeriods: vi.fn() }));
vi.mock("@/hooks/useAudienceDashboard", () => ({ useAudienceDashboard: vi.fn() }));
vi.mock("@/hooks/useDocumentStatus", () => ({ useDocumentStatus: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/export/ExportModal", () => ({
  ExportModal: ({ onClose, periodLabel }: { onClose: () => void; periodLabel?: string }) => (
    <div role="dialog">
      Export Modal {periodLabel}
      <button onClick={onClose}>Close Export</button>
    </div>
  ),
}));
vi.mock("@/components/insights/InsightPanel", () => ({
  InsightPanel: () => <div>Insight Panel</div>,
}));
vi.mock("@/components/report/AudienceSections", () => ({
  ManagementSection: () => <div>Management Section</div>,
  BoardSection: () => <div>Board Section</div>,
  EquitySection: () => <div>Equity Section</div>,
  CreditSection: () => <div>Credit Section</div>,
  BudgetVarianceSection: () => <div>Budget Variance Section</div>,
}));

import { getCompanyPeriods } from "@/api/companies";
import { useAudienceDashboard } from "@/hooks/useAudienceDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentStatus } from "@/hooks/useDocumentStatus";
import type { CompanyDocument } from "@/types/document";
import { ReportView } from "@/views/ReportView";

const refetch = vi.fn();
const regenerate = vi.fn();
const setInsight = vi.fn();

function dashboardResult(overrides: Partial<ReturnType<typeof useAudienceDashboard>> = {}) {
  return {
    company: { id: "company-1", name: "Senus PLC", currency: "EUR" },
    metrics: { currency: "EUR" },
    history: null,
    insight: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
    errorKind: null,
    regenerate,
    refetch,
    setInsight,
    ...overrides,
  } as unknown as ReturnType<typeof useAudienceDashboard>;
}

function doc(overrides: Partial<CompanyDocument> = {}): CompanyDocument {
  return {
    id: "doc-1",
    company_id: "company-1",
    filename: "report.pdf",
    file_type: "application/pdf",
    status: "extracted",
    period_start: null,
    period_end: null,
    error_message: null,
    source_type: "manual_upload",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function documentStatusResult(overrides: Partial<ReturnType<typeof useDocumentStatus>> = {}) {
  return {
    documents: [doc()],
    documentsLoaded: true,
    isProcessing: false,
    elapsedMs: 0,
    ...overrides,
  } as unknown as ReturnType<typeof useDocumentStatus>;
}

function renderView(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/companies/company-1/report${search}`]}>
      <Routes>
        <Route path="/companies/:companyId/report" element={<ReportView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ReportView", () => {
  beforeEach(() => {
    vi.mocked(getCompanyPeriods).mockReset();
    vi.mocked(getCompanyPeriods).mockResolvedValue([]);
    vi.mocked(useAuth).mockReturnValue({ user: { id: "user-1", role: "owner" } } as unknown as ReturnType<
      typeof useAuth
    >);
    vi.mocked(useAudienceDashboard).mockReturnValue(dashboardResult());
    vi.mocked(useDocumentStatus).mockReturnValue(documentStatusResult());
    refetch.mockReset();
    regenerate.mockReset();
    setInsight.mockReset();
  });

  it("shows a full-page loading state until documents have loaded", () => {
    vi.mocked(useDocumentStatus).mockReturnValue(documentStatusResult({ documentsLoaded: false }));
    renderView();

    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
    expect(screen.queryByText("Management Section")).not.toBeInTheDocument();
  });

  it("shows the processing status while extraction is in progress", () => {
    vi.mocked(useDocumentStatus).mockReturnValue(
      documentStatusResult({ isProcessing: true, documents: [doc({ status: "processing" })] }),
    );
    renderView();

    expect(screen.getByText(/Analyzing your financial documents/i)).toBeInTheDocument();
  });

  it("shows a no-data prompt when there are no documents at all", () => {
    vi.mocked(useDocumentStatus).mockReturnValue(documentStatusResult({ documents: [] }));
    renderView();

    expect(screen.getByText(/No financial data yet/i)).toBeInTheDocument();
  });

  it("shows the error state with a working Retry button", () => {
    vi.mocked(useAudienceDashboard).mockReturnValue(
      dashboardResult({ error: "Couldn't reach the server. Check your connection and try again." }),
    );
    renderView();

    expect(screen.getByText("Couldn't reach the server. Check your connection and try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("renders the Management section by default", () => {
    renderView();

    expect(screen.getByText("Management View")).toBeInTheDocument();
    expect(screen.getByText("Management Section")).toBeInTheDocument();
    expect(screen.queryByText("Board Section")).not.toBeInTheDocument();
    expect(screen.getByText("Budget Variance Section")).toBeInTheDocument();
    expect(screen.getByText("Insight Panel")).toBeInTheDocument();
  });

  it("renders the audience section requested via the URL", () => {
    renderView("?audience=board");

    expect(screen.getByText("Board View")).toBeInTheDocument();
    expect(screen.getByText("Board Section")).toBeInTheDocument();
    expect(screen.queryByText("Management Section")).not.toBeInTheDocument();
  });

  it("falls back to Management for an invalid audience value", () => {
    renderView("?audience=not-a-real-audience");

    expect(screen.getByText("Management View")).toBeInTheDocument();
  });

  it("shows the Credit section for credit and passes an empty history-keys request", () => {
    renderView("?audience=credit");

    expect(screen.getByText("Credit Section")).toBeInTheDocument();
    expect(useAudienceDashboard).toHaveBeenCalledWith("company-1", "credit", [], undefined);
  });

  it("hides the period selector when there are no periods, shows it and switches when there are", async () => {
    vi.mocked(getCompanyPeriods).mockResolvedValue([
      { period_start: "2024-07-01", period_end: "2025-06-30", period_type: "FY", fiscal_year: 2025, fiscal_quarter: null },
      { period_start: "2023-07-01", period_end: "2024-06-30", period_type: "FY", fiscal_year: 2024, fiscal_quarter: null },
    ]);
    renderView();

    expect(screen.queryByText("Period")).not.toBeInTheDocument();
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "2024-06-30" } });

    await waitFor(() =>
      expect(useAudienceDashboard).toHaveBeenLastCalledWith("company-1", "management", expect.any(Array), "2024-06-30"),
    );
  });

  it("only shows Export Report once the report is ready, and opens/closes the modal", async () => {
    vi.mocked(useDocumentStatus).mockReturnValue(documentStatusResult({ documentsLoaded: false }));
    const { rerender } = renderView();
    expect(screen.queryByRole("button", { name: /Export Report/i })).not.toBeInTheDocument();

    vi.mocked(useDocumentStatus).mockReturnValue(documentStatusResult());
    rerender(
      <MemoryRouter initialEntries={["/companies/company-1/report"]}>
        <Routes>
          <Route path="/companies/:companyId/report" element={<ReportView />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Export Report/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Export" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the failed-documents notice when a document failed extraction", () => {
    vi.mocked(useDocumentStatus).mockReturnValue(
      documentStatusResult({ documents: [doc({ status: "failed", filename: "bad.pdf" })] }),
    );
    renderView();

    expect(screen.getByText(/couldn't be processed/i)).toBeInTheDocument();
  });

  it("refetches automatically once processing transitions from true to false", () => {
    vi.mocked(useDocumentStatus).mockReturnValue(
      documentStatusResult({ isProcessing: true, documents: [doc({ status: "processing" })] }),
    );
    const { rerender } = renderView();
    expect(refetch).not.toHaveBeenCalled();

    vi.mocked(useDocumentStatus).mockReturnValue(documentStatusResult({ isProcessing: false }));
    rerender(
      <MemoryRouter initialEntries={["/companies/company-1/report"]}>
        <Routes>
          <Route path="/companies/:companyId/report" element={<ReportView />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an 'Updating…' indicator during a refresh instead of blanking the page", () => {
    vi.mocked(useAudienceDashboard).mockReturnValue(dashboardResult({ isRefreshing: true }));
    renderView();

    expect(screen.getByText("Updating…")).toBeInTheDocument();
    expect(screen.getByText("Management Section")).toBeInTheDocument();
  });
});
