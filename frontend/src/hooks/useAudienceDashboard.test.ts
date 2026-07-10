import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/companies", () => ({
  getCompany: vi.fn(),
}));
vi.mock("@/api/insights", () => ({
  getInsight: vi.fn(),
  regenerateInsight: vi.fn(),
}));
vi.mock("@/api/metrics", () => ({
  getMetrics: vi.fn(),
  getMetricsHistory: vi.fn(),
}));

import { getCompany } from "@/api/companies";
import { getInsight } from "@/api/insights";
import { getMetrics, getMetricsHistory } from "@/api/metrics";
import { useAudienceDashboard } from "@/hooks/useAudienceDashboard";
import type { Company } from "@/types/company";
import type { Insight } from "@/types/insight";
import type { MetricHistoryResponse, MetricsResponse } from "@/types/metrics";

const company: Company = {
  id: "company-1",
  organization_id: "org-1",
  name: "Senus PLC",
  industry: "Natural Capital Software",
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
};

const metrics: MetricsResponse = {
  company_id: "company-1",
  currency: "EUR",
  period_start: "2025-07-01",
  period_end: "2025-12-31",
  growth: [],
  profitability: [],
  cash: [],
  solvency: [],
  returns: [],
};

const history: MetricHistoryResponse = { company_id: "company-1", series: {} };

const insight: Insight = {
  id: "insight-1",
  company_id: "company-1",
  audience: "management",
  period_start: "2025-07-01",
  period_end: "2025-12-31",
  insight_type: "board_report",
  title: "H1 FY2026 Summary",
  body: "Revenue grew strongly against the prior half.",
  structured_content: null,
  edited_content: null,
  is_edited: false,
  edited_by_user_id: null,
  edited_by_name: null,
  edited_at: null,
  severity: "info",
  created_at: "2026-01-05T00:00:00Z",
};

function notFoundError() {
  return { isAxiosError: true, response: { status: 404 } };
}

function networkError() {
  return { isAxiosError: true, response: undefined };
}

describe("useAudienceDashboard", () => {
  beforeEach(() => {
    vi.mocked(getCompany).mockReset();
    vi.mocked(getMetrics).mockReset();
    vi.mocked(getMetricsHistory).mockReset();
    vi.mocked(getInsight).mockReset();
  });

  it("loads company, metrics, history and insight together", async () => {
    vi.mocked(getCompany).mockResolvedValue(company);
    vi.mocked(getMetrics).mockResolvedValue(metrics);
    vi.mocked(getMetricsHistory).mockResolvedValue(history);
    vi.mocked(getInsight).mockResolvedValue(insight);

    const { result } = renderHook(() => useAudienceDashboard("company-1", "management", ["revenue"]));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.company).toEqual(company);
    expect(result.current.metrics).toEqual(metrics);
    expect(result.current.history).toEqual(history);
    expect(result.current.insight).toEqual(insight);
    expect(result.current.error).toBeNull();
    expect(result.current.errorKind).toBeNull();
  });

  it("treats a 404 on the insight fetch as 'no insight generated yet', not an error", async () => {
    vi.mocked(getCompany).mockResolvedValue(company);
    vi.mocked(getMetrics).mockResolvedValue(metrics);
    vi.mocked(getMetricsHistory).mockResolvedValue(history);
    vi.mocked(getInsight).mockRejectedValue(notFoundError());

    const { result } = renderHook(() => useAudienceDashboard("company-1", "management", ["revenue"]));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.insight).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.errorKind).toBeNull();
  });

  it("propagates a non-404 insight failure as a real error instead of hiding it", async () => {
    vi.mocked(getCompany).mockResolvedValue(company);
    vi.mocked(getMetrics).mockResolvedValue(metrics);
    vi.mocked(getMetricsHistory).mockResolvedValue(history);
    vi.mocked(getInsight).mockRejectedValue(networkError());

    const { result } = renderHook(() => useAudienceDashboard("company-1", "management", ["revenue"]));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.errorKind).toBe("network");
    expect(result.current.error).toBe("Couldn't reach the server. Check your connection and try again.");
  });

  it("classifies a metrics-fetch network failure and leaves metrics unset", async () => {
    vi.mocked(getCompany).mockResolvedValue(company);
    vi.mocked(getMetrics).mockRejectedValue(networkError());
    vi.mocked(getMetricsHistory).mockResolvedValue(history);

    const { result } = renderHook(() => useAudienceDashboard("company-1", "management", ["revenue"]));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.errorKind).toBe("network");
    expect(result.current.metrics).toBeNull();
    // The company call landed before the metrics call failed, so the header
    // should still be able to render the company name even though the rest
    // of the dashboard errored.
    expect(result.current.company).toEqual(company);
  });

  it("does nothing when no companyId is provided yet", async () => {
    const { result } = renderHook(() => useAudienceDashboard(undefined, "management", []));

    expect(getCompany).not.toHaveBeenCalled();
    expect(result.current.company).toBeNull();
  });
});
