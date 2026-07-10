import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/benchmarks", () => ({ deleteBenchmark: vi.fn(), listBenchmarks: vi.fn() }));
vi.mock("@/api/companies", () => ({ getCompany: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { deleteBenchmark, listBenchmarks } from "@/api/benchmarks";
import { getCompany } from "@/api/companies";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import type { IndustryBenchmark } from "@/types/benchmark";
import type { Company } from "@/types/company";
import { BenchmarkSettingsView } from "@/views/BenchmarkSettingsView";

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    organization_id: "org-1",
    name: "Senus PLC",
    industry: "Natural Capital Software",
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

function benchmark(overrides: Partial<IndustryBenchmark> = {}): IndustryBenchmark {
  return {
    id: "bench-1",
    industry: "Natural Capital Software",
    metric_key: "gross_margin",
    period_label: "2025 FY",
    benchmark_value: 65,
    source: "Industry report XYZ, 2025",
    created_by_user_id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockAuth(role: UserRole) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "user-1", role } } as unknown as ReturnType<typeof useAuth>);
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/companies/company-1/benchmarks"]}>
      <Routes>
        <Route path="/companies/:companyId/benchmarks" element={<BenchmarkSettingsView />} />
        <Route path="/companies/:companyId/benchmarks/new" element={<div>Add Benchmark Page</div>} />
        <Route path="/companies/:companyId/benchmarks/:id/edit" element={<div>Edit Benchmark Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

describe("BenchmarkSettingsView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(listBenchmarks).mockReset();
    vi.mocked(deleteBenchmark).mockReset();
  });

  it("shows a hint instead of the list when the company has no industry set", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company({ industry: null }));

    renderView();
    await waitForLoaded();

    expect(screen.getByText(/This company has no industry set/i)).toBeInTheDocument();
    expect(listBenchmarks).not.toHaveBeenCalled();
  });

  it("loads benchmarks scoped to the company's industry", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listBenchmarks).mockResolvedValue([benchmark()]);

    renderView();
    await waitForLoaded();

    expect(listBenchmarks).toHaveBeenCalledWith("Natural Capital Software");
    expect(screen.getByText(/Gross Margin/)).toBeInTheDocument();
    expect(screen.getByText(/2025 FY/)).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
  });

  it("hides Add Benchmark and edit/delete actions for a non-manager", async () => {
    mockAuth("analyst");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listBenchmarks).mockResolvedValue([benchmark()]);

    renderView();
    await waitForLoaded();

    expect(screen.queryByRole("button", { name: /Add Benchmark/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/i })).not.toBeInTheDocument();
  });

  it("navigates to Add Benchmark and Edit Benchmark", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listBenchmarks).mockResolvedValue([benchmark()]);
    renderView();
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(await screen.findByText("Edit Benchmark Page")).toBeInTheDocument();
  });

  it("deletes a benchmark after confirming in the modal", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listBenchmarks).mockResolvedValue([benchmark()]);
    vi.mocked(deleteBenchmark).mockResolvedValue(undefined);
    renderView();
    await waitForLoaded();

    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteBenchmark).toHaveBeenCalledWith("bench-1"));
    expect(await screen.findByText(/No benchmarks set for this industry yet\./)).toBeInTheDocument();
  });
});
