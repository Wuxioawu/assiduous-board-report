import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/benchmarks", () => ({ listBenchmarks: vi.fn(), setBenchmark: vi.fn() }));
vi.mock("@/api/companies", () => ({ getCompany: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { listBenchmarks, setBenchmark } from "@/api/benchmarks";
import { getCompany } from "@/api/companies";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import type { IndustryBenchmark } from "@/types/benchmark";
import type { Company } from "@/types/company";
import { BenchmarkEditView } from "@/views/BenchmarkEditView";

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
    <MemoryRouter initialEntries={["/companies/company-1/benchmarks/bench-1/edit"]}>
      <Routes>
        <Route path="/companies/:companyId/benchmarks/:id/edit" element={<BenchmarkEditView />} />
        <Route path="/companies/:companyId/benchmarks" element={<div>Benchmark Settings Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BenchmarkEditView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(listBenchmarks).mockReset();
    vi.mocked(setBenchmark).mockReset();
  });

  it("redirects a non-manager to the benchmark settings page", async () => {
    mockAuth("analyst");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listBenchmarks).mockResolvedValue([benchmark()]);

    renderView();

    expect(await screen.findByText("Benchmark Settings Page")).toBeInTheDocument();
  });

  it("pre-fills value and source, and locks the identity fields", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listBenchmarks).mockResolvedValue([benchmark()]);

    renderView();

    expect(await screen.findByDisplayValue("65")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Industry report XYZ, 2025")).toBeInTheDocument();
    expect(screen.getByText(/Gross Margin/)).toBeInTheDocument();
    expect(screen.getByText(/Industry: Natural Capital Software/)).toBeInTheDocument();
    // Identity fields are locked read-only text, not editable inputs.
    expect(screen.queryByLabelText("Industry")).not.toBeInTheDocument();
  });

  it("shows an error when the company has no industry", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company({ industry: null }));

    renderView();

    expect(await screen.findByText("This company has no industry set.")).toBeInTheDocument();
    expect(listBenchmarks).not.toHaveBeenCalled();
  });

  it("shows an error when the benchmark no longer exists", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listBenchmarks).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText("This benchmark no longer exists.")).toBeInTheDocument();
  });

  it("saves the updated value/source, preserving the original industry/metric/period identity", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listBenchmarks).mockResolvedValue([benchmark()]);
    vi.mocked(setBenchmark).mockResolvedValue(benchmark({ benchmark_value: 70 }));

    renderView();
    const valueInput = await screen.findByDisplayValue("65");
    fireEvent.change(valueInput, { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Benchmark" }));

    await waitFor(() =>
      expect(setBenchmark).toHaveBeenCalledWith({
        industry: "Natural Capital Software",
        metric_key: "gross_margin",
        period_label: "2025 FY",
        benchmark_value: 70,
        source: "Industry report XYZ, 2025",
      }),
    );
    expect(await screen.findByText("Benchmark Settings Page")).toBeInTheDocument();
  });

  it("shows the backend error on save failure", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(listBenchmarks).mockResolvedValue([benchmark()]);
    vi.mocked(setBenchmark).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Failed to save benchmark" } },
    });

    renderView();
    await screen.findByDisplayValue("65");
    fireEvent.click(screen.getByRole("button", { name: "Save Benchmark" }));

    expect(await screen.findByText("Failed to save benchmark")).toBeInTheDocument();
  });
});
