import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/benchmarks", () => ({ setBenchmark: vi.fn() }));
vi.mock("@/api/companies", () => ({ getCompany: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { setBenchmark } from "@/api/benchmarks";
import { getCompany } from "@/api/companies";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types/auth";
import type { Company } from "@/types/company";
import { BenchmarkCreateView } from "@/views/BenchmarkCreateView";

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

function mockAuth(role: UserRole) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: "user-1", role } } as unknown as ReturnType<typeof useAuth>);
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/companies/company-1/benchmarks/new"]}>
      <Routes>
        <Route path="/companies/:companyId/benchmarks/new" element={<BenchmarkCreateView />} />
        <Route path="/companies/:companyId/benchmarks" element={<div>Benchmark Settings Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BenchmarkCreateView", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(setBenchmark).mockReset();
  });

  it("redirects a non-manager to the benchmark settings page", async () => {
    mockAuth("analyst");
    vi.mocked(getCompany).mockResolvedValue(company());

    renderView();

    expect(await screen.findByText("Benchmark Settings Page")).toBeInTheDocument();
  });

  it("pre-fills industry from the company", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    renderView();

    expect(await screen.findByDisplayValue("Natural Capital Software")).toBeInTheDocument();
  });

  it("requires industry, period, and source before saving", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company({ industry: null }));
    renderView();
    await screen.findByLabelText("Industry");

    // All four fields are natively `required` - the number field must hold a
    // syntactically valid value or native constraint validation blocks the
    // submit event before React's handler ever runs, regardless of what the
    // text fields contain. Whitespace satisfies `required` (non-empty) while
    // still failing this component's own trim()-based check, so it's the only
    // way to actually exercise that JS validation rather than the browser's.
    fireEvent.change(screen.getByLabelText("Industry"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Benchmark Value"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Benchmark" }));

    expect(await screen.findByText("Industry, period, and source are all required")).toBeInTheDocument();
    expect(setBenchmark).not.toHaveBeenCalled();
  });

  it("saves the benchmark and navigates back", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(setBenchmark).mockResolvedValue({
      id: "bench-new",
      industry: "Natural Capital Software",
      metric_key: "gross_margin",
      period_label: "2025 FY",
      benchmark_value: 65,
      source: "Report XYZ",
      created_by_user_id: "user-1",
      created_at: "2026-01-01T00:00:00Z",
    });
    renderView();
    await screen.findByLabelText("Period");

    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "2025 FY" } });
    fireEvent.change(screen.getByLabelText("Benchmark Value"), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "Report XYZ" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Benchmark" }));

    await waitFor(() =>
      expect(setBenchmark).toHaveBeenCalledWith({
        industry: "Natural Capital Software",
        metric_key: "gross_margin",
        period_label: "2025 FY",
        benchmark_value: 65,
        source: "Report XYZ",
      }),
    );
    expect(await screen.findByText("Benchmark Settings Page")).toBeInTheDocument();
  });

  it("shows the backend error on failure", async () => {
    mockAuth("owner");
    vi.mocked(getCompany).mockResolvedValue(company());
    vi.mocked(setBenchmark).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "A benchmark for this industry/metric/period already exists" } },
    });
    renderView();
    await screen.findByLabelText("Period");

    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "2025 FY" } });
    fireEvent.change(screen.getByLabelText("Benchmark Value"), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "Report XYZ" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Benchmark" }));

    expect(
      await screen.findByText("A benchmark for this industry/metric/period already exists"),
    ).toBeInTheDocument();
  });
});
