import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/companies", () => ({ getCompany: vi.fn() }));
vi.mock("@/api/documents", () => ({ listDocuments: vi.fn() }));
vi.mock("@/api/financialStatements", () => ({ listFinancialStatements: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { getCompany } from "@/api/companies";
import { listDocuments } from "@/api/documents";
import { listFinancialStatements } from "@/api/financialStatements";
import type { Company } from "@/types/company";
import type { CompanyDocument } from "@/types/document";
import type { FinancialStatement } from "@/types/financialStatement";
import { CompanyDocumentsHubView } from "@/views/CompanyDocumentsHubView";

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
    period_type: "FY",
    status: "confirmed",
    confidence_score: 0.95,
    source_excerpt: null,
    source_page: null,
    extracted_by: "ai",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/companies/company-1/documents"]}>
      <Routes>
        <Route path="/companies/:companyId/documents" element={<CompanyDocumentsHubView />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

describe("CompanyDocumentsHubView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(listDocuments).mockReset();
    vi.mocked(listFinancialStatements).mockReset();
  });

  it("shows the company name in the title once loaded", async () => {
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(listFinancialStatements).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText(/Documents · Senus PLC/)).toBeInTheDocument();
  });

  it("summarizes zero documents/line items distinctly from the loading state", async () => {
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(listFinancialStatements).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByText("No line items yet")).toBeInTheDocument();
  });

  it("summarizes document extraction progress and distinct periods with correct singular/plural", async () => {
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([
      doc({ id: "d1", status: "extracted" }),
      doc({ id: "d2", status: "processing" }),
    ]);
    vi.mocked(listFinancialStatements).mockResolvedValue([
      statement({ id: "fs1", taxonomy_code: "REVENUE" }),
      statement({ id: "fs2", taxonomy_code: "COGS" }),
      statement({ id: "fs3", taxonomy_code: "REVENUE", period_start: "2023-07-01", period_end: "2024-06-30" }),
    ]);

    renderView();
    await waitForLoaded();

    expect(screen.getByText("2 documents, 1 extracted")).toBeInTheDocument();
    // 3 line items across 2 distinct (period_start, period_end) pairs.
    expect(screen.getByText("3 line items across 2 periods")).toBeInTheDocument();
  });

  it("uses singular wording for exactly one document and one line item across one period", async () => {
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "extracted" })]);
    vi.mocked(listFinancialStatements).mockResolvedValue([statement()]);

    renderView();
    await waitForLoaded();

    expect(screen.getByText("1 document, 1 extracted")).toBeInTheDocument();
    expect(screen.getByText("1 line item across 1 period")).toBeInTheDocument();
  });

  it("links each tile to its sub-view", async () => {
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(listFinancialStatements).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    expect(screen.getByRole("link", { name: /Document Ingestion/ })).toHaveAttribute(
      "href",
      "/companies/company-1/documents/ingestion",
    );
    expect(screen.getByRole("link", { name: /Financial Data/ })).toHaveAttribute(
      "href",
      "/companies/company-1/documents/financial-data",
    );
  });

  it("shows an error when the summary fetch fails, independent of the company fetch", async () => {
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockRejectedValue(new Error("boom"));
    vi.mocked(listFinancialStatements).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText("Failed to load summary")).toBeInTheDocument();
  });
});
