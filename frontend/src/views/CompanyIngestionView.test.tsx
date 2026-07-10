import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/companies", () => ({
  getCompany: vi.fn(),
  updateCompany: vi.fn(),
  fetchCompanyNow: vi.fn(),
}));
vi.mock("@/api/documents", () => ({
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ useToast: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { fetchCompanyNow, getCompany, updateCompany } from "@/api/companies";
import { deleteDocument, listDocuments, uploadDocument } from "@/api/documents";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import type { UserRole } from "@/types/auth";
import type { Company, CompanyFetchResult } from "@/types/company";
import type { CompanyDocument } from "@/types/document";
import { CompanyIngestionView } from "@/views/CompanyIngestionView";

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

const showToast = vi.fn();

function mockAuth(role: UserRole) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "user-1", role },
  } as unknown as ReturnType<typeof useAuth>);
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/companies/company-1/documents/ingestion"]}>
      <Routes>
        <Route path="/companies/:companyId/documents/ingestion" element={<CompanyIngestionView />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

function documentsTable() {
  return within(screen.getByRole("table"));
}

describe("CompanyIngestionView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(updateCompany).mockReset();
    vi.mocked(fetchCompanyNow).mockReset();
    vi.mocked(listDocuments).mockReset();
    vi.mocked(uploadDocument).mockReset();
    vi.mocked(deleteDocument).mockReset();
    vi.mocked(useToast).mockReturnValue({ showToast } as unknown as ReturnType<typeof useToast>);
    showToast.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and displays the document list", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([doc({ filename: "half-year-results.pdf" })]);

    renderView();
    await waitForLoaded();

    expect(screen.getByText(/Document Ingestion · Senus PLC/)).toBeInTheDocument();
    expect(documentsTable().getByText("half-year-results.pdf")).toBeInTheDocument();
    expect(documentsTable().getByText("Extracted")).toBeInTheDocument();
  });

  it("shows a permission notice instead of upload/fetch controls for read-only roles", async () => {
    mockAuth("viewer");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    expect(screen.getByText(/don't have permission to upload documents/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Upload a PDF document/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Automated Fetching")).not.toBeInTheDocument();
  });

  it("uploads a staged PDF and adds it to the document list", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(uploadDocument).mockResolvedValue(doc({ id: "doc-new", filename: "new-filing.pdf" }));

    const { container } = renderView();
    await waitForLoaded();

    const file = new File(["%PDF-1.4 content"], "new-filing.pdf", { type: "application/pdf" });
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("new-filing.pdf")).toBeInTheDocument(); // staged in dropzone
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledWith("company-1", file, expect.any(Function)));
    await waitFor(() => expect(documentsTable().getByText("new-filing.pdf")).toBeInTheDocument());
  });

  it("rejects a non-PDF file before ever calling uploadDocument", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([]);

    const { container } = renderView();
    await waitForLoaded();

    const file = new File(["not a pdf"], "notes.txt", { type: "text/plain" });
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("Only PDF files are supported.")).toBeInTheDocument();
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("pre-fills the investor-relations form from the loaded company and saves changes", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(
      company({ investor_relations_url: "https://senus.example/investors", auto_fetch_enabled: true }),
    );
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(updateCompany).mockResolvedValue(
      company({ investor_relations_url: "https://senus.example/ir-updated", auto_fetch_enabled: false }),
    );

    renderView();
    await waitForLoaded();

    const urlInput = screen.getByLabelText("Investor-relations page URL") as HTMLInputElement;
    expect(urlInput.value).toBe("https://senus.example/investors");
    const checkbox = screen.getByRole("checkbox", { name: /enable automatic fetching/i });
    expect(checkbox).toBeChecked();

    fireEvent.change(urlInput, { target: { value: "https://senus.example/ir-updated" } });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateCompany).toHaveBeenCalledWith("company-1", {
        investor_relations_url: "https://senus.example/ir-updated",
        auto_fetch_enabled: false,
      }),
    );
  });

  it("shows the backend error when saving fetch settings fails", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(updateCompany).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Invalid URL" } },
    });

    renderView();
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Invalid URL")).toBeInTheDocument();
  });

  it("disables Check Now until an investor-relations URL is configured", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company({ investor_relations_url: null }));
    vi.mocked(listDocuments).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    expect(screen.getByRole("button", { name: "Check Now" })).toBeDisabled();
  });

  it("Check Now surfaces new documents and refreshes the list", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(
      company({ investor_relations_url: "https://senus.example/investors" }),
    );
    vi.mocked(listDocuments).mockResolvedValueOnce([]);
    const result: CompanyFetchResult = {
      found_new: 1,
      message: "Found 1 new filing.",
      last_fetch_checked_at: "2026-01-02T00:00:00Z",
      auto_fetch_enabled: false,
    };
    vi.mocked(fetchCompanyNow).mockResolvedValue(result);

    renderView();
    await waitForLoaded();

    vi.mocked(listDocuments).mockResolvedValue([doc({ filename: "auto-fetched.pdf", source_type: "auto_fetched" })]);
    fireEvent.click(screen.getByRole("button", { name: "Check Now" }));

    expect(await screen.findByText("Found 1 new filing.")).toBeInTheDocument();
    await waitFor(() => expect(documentsTable().getByText("auto-fetched.pdf")).toBeInTheDocument());
    expect(documentsTable().getByText("Auto-fetched")).toBeInTheDocument();
  });

  it("Check Now shows a paused notice when the circuit breaker disables auto-fetch mid-check", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(
      company({ investor_relations_url: "https://senus.example/investors", auto_fetch_enabled: true }),
    );
    vi.mocked(listDocuments).mockResolvedValue([]);
    vi.mocked(fetchCompanyNow).mockResolvedValue({
      found_new: 12,
      message: "Auto-fetch paused: too many new documents detected at once.",
      last_fetch_checked_at: "2026-01-02T00:00:00Z",
      auto_fetch_enabled: false,
    });

    renderView();
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: "Check Now" }));

    const message = await screen.findByText("Auto-fetch paused: too many new documents detected at once.");
    expect(message.className).toContain("amber");
    expect(screen.getByRole("checkbox", { name: /enable automatic fetching/i })).not.toBeChecked();
  });

  it("polls the document list while any document is pending/processing and stops once settled", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: "processing" })]);

    vi.useFakeTimers();
    try {
      renderView();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(listDocuments).toHaveBeenCalledTimes(1);

      vi.mocked(listDocuments).mockResolvedValue([doc({ status: "extracted" })]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(listDocuments).toHaveBeenCalledTimes(2);
      expect(documentsTable().getByText("Extracted")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(9000);
      });
      // No document is in progress any more - the interval must have been torn down.
      expect(listDocuments).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("deletes a document after confirming in the modal", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listDocuments).mockResolvedValue([doc({ filename: "old-report.pdf" })]);
    vi.mocked(deleteDocument).mockResolvedValue(undefined);

    renderView();
    await waitForLoaded();

    const row = documentsTable().getByText("old-report.pdf").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: /delete/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Document" }));

    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith("company-1", "doc-1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("No documents uploaded yet for this company.")).toBeInTheDocument();
  });
});
