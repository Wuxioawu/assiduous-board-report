import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/documents", () => ({
  getDocument: vi.fn(),
  reExtractDocument: vi.fn(),
  getLatestAccuracyReport: vi.fn(),
  generateAccuracyReport: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import {
  generateAccuracyReport,
  getDocument,
  getLatestAccuracyReport,
  reExtractDocument,
} from "@/api/documents";
import { useAuth } from "@/hooks/useAuth";
import type { AccuracyReport } from "@/types/accuracyReport";
import type { UserRole } from "@/types/auth";
import type { CompanyDocument } from "@/types/document";
import { DocumentDetailView } from "@/views/DocumentDetailView";

function doc(overrides: Partial<CompanyDocument> = {}): CompanyDocument {
  return {
    id: "doc-1",
    company_id: "company-1",
    filename: "senus-hy2026.pdf",
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

function report(overrides: Partial<AccuracyReport> = {}): AccuracyReport {
  return {
    id: "report-1",
    document_id: "doc-1",
    pipeline_version: "v1",
    scorecard: {
      fields_compared: 43,
      exact_matches: 43,
      mismatches: [],
      identity_checks_passed: 4,
      identity_checks_total: 4,
      identity_check_results: [],
      ground_truth_available: true,
      ground_truth_fixture: "senus-hy2026.pdf",
    },
    created_at: "2026-01-01T01:00:00Z",
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
    <MemoryRouter initialEntries={["/companies/company-1/documents/doc-1"]}>
      <Routes>
        <Route path="/companies/:companyId/documents/:documentId" element={<DocumentDetailView />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

describe("DocumentDetailView", () => {
  beforeEach(() => {
    vi.mocked(getDocument).mockReset();
    vi.mocked(reExtractDocument).mockReset();
    vi.mocked(getLatestAccuracyReport).mockReset();
    vi.mocked(generateAccuracyReport).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows document metadata for any role", async () => {
    mockAuth("viewer");
    vi.mocked(getDocument).mockResolvedValue(doc());

    renderView();
    await waitForLoaded();

    expect(screen.getByText("senus-hy2026.pdf")).toBeInTheDocument();
    expect(screen.getByText("Extracted")).toBeInTheDocument();
  });

  it("hides both Re-extract and Accuracy panel for a viewer", async () => {
    mockAuth("viewer");
    vi.mocked(getDocument).mockResolvedValue(doc());

    renderView();
    await waitForLoaded();

    expect(screen.queryByRole("button", { name: /re-extract/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Accuracy")).not.toBeInTheDocument();
  });

  it("shows Re-extract but not the Accuracy panel for an analyst", async () => {
    mockAuth("analyst");
    vi.mocked(getDocument).mockResolvedValue(doc());

    renderView();
    await waitForLoaded();

    expect(screen.getByRole("button", { name: /re-extract/i })).toBeInTheDocument();
    expect(screen.queryByText("Accuracy")).not.toBeInTheDocument();
  });

  it("shows the Accuracy panel for an admin, with no report yet", async () => {
    mockAuth("admin");
    vi.mocked(getDocument).mockResolvedValue(doc());
    vi.mocked(getLatestAccuracyReport).mockResolvedValue(null);

    renderView();
    await waitForLoaded();

    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("No accuracy report has been run for this document yet.")).toBeInTheDocument(),
    );
  });

  it("shows the scorecard summary line for an owner when a report exists", async () => {
    mockAuth("owner");
    vi.mocked(getDocument).mockResolvedValue(doc());
    vi.mocked(getLatestAccuracyReport).mockResolvedValue(report());

    renderView();
    await waitForLoaded();

    expect(
      await screen.findByText("43/43 fields exact match · 4/4 accounting identities passed · pipeline v1"),
    ).toBeInTheDocument();
  });

  it("shows a mismatch row with expected/got and a source-excerpt toggle", async () => {
    mockAuth("owner");
    vi.mocked(getDocument).mockResolvedValue(doc());
    vi.mocked(getLatestAccuracyReport).mockResolvedValue(
      report({
        scorecard: {
          fields_compared: 43,
          exact_matches: 42,
          mismatches: [
            {
              period_label: "HY2026",
              field: "REVENUE",
              expected: 354813,
              got: 999999,
              source_excerpt: "Turnover 354,813",
              source_page: 5,
              statement_id: "stmt-1",
            },
          ],
          identity_checks_passed: 4,
          identity_checks_total: 4,
          identity_check_results: [],
          ground_truth_available: true,
          ground_truth_fixture: "senus-hy2026.pdf",
        },
      }),
    );

    renderView();
    await waitForLoaded();

    const row = (await screen.findByText("REVENUE")).closest("tr")!;
    expect(within(row).getByText("354,813")).toBeInTheDocument();
    expect(within(row).getByText("999,999")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: /view source/i }));
    expect(await screen.findByText(/Turnover 354,813/)).toBeInTheDocument();
  });

  it("clicking Run Accuracy Report calls generateAccuracyReport and shows the result", async () => {
    mockAuth("owner");
    vi.mocked(getDocument).mockResolvedValue(doc());
    vi.mocked(getLatestAccuracyReport).mockResolvedValue(null);
    vi.mocked(generateAccuracyReport).mockResolvedValue(report());

    renderView();
    await waitForLoaded();
    await waitFor(() =>
      expect(screen.getByText("No accuracy report has been run for this document yet.")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /run accuracy report/i }));

    await waitFor(() => expect(generateAccuracyReport).toHaveBeenCalledWith("company-1", "doc-1"));
    expect(
      await screen.findByText("43/43 fields exact match · 4/4 accounting identities passed · pipeline v1"),
    ).toBeInTheDocument();
  });

  it("surfaces the backend's 409 detail instead of a bare 'Failed to generate' message", async () => {
    mockAuth("owner");
    vi.mocked(getDocument).mockResolvedValue(doc());
    vi.mocked(getLatestAccuracyReport).mockResolvedValue(null);
    vi.mocked(generateAccuracyReport).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Extraction not complete for this document (status: pending)" } },
    });

    renderView();
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: /run accuracy report/i }));

    expect(
      await screen.findByText("Extraction not complete for this document (status: pending)"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Failed to generate the accuracy report")).not.toBeInTheDocument();
  });

  it("surfaces the backend's 422 malformed-fixture detail instead of a bare 'Failed to generate' message", async () => {
    mockAuth("owner");
    vi.mocked(getDocument).mockResolvedValue(doc());
    vi.mocked(getLatestAccuracyReport).mockResolvedValue(null);
    vi.mocked(generateAccuracyReport).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Ground-truth fixture malformed: missing key 'periods'" } },
    });

    renderView();
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: /run accuracy report/i }));

    expect(
      await screen.findByText("Ground-truth fixture malformed: missing key 'periods'"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Failed to generate the accuracy report")).not.toBeInTheDocument();
  });

  it("clicking Re-extract calls reExtractDocument and reflects the new status", async () => {
    mockAuth("owner");
    vi.mocked(getDocument).mockResolvedValue(doc());
    vi.mocked(getLatestAccuracyReport).mockResolvedValue(report());
    vi.mocked(reExtractDocument).mockResolvedValue(doc({ status: "pending" }));

    renderView();
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: /re-extract/i }));

    await waitFor(() => expect(reExtractDocument).toHaveBeenCalledWith("company-1", "doc-1"));
    expect(await screen.findByText("Pending")).toBeInTheDocument();
  });
});
