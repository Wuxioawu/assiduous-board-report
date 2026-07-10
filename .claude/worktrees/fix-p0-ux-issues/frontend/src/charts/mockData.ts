import type {
  CashRunwayStep,
  MarginBreakdownEntry,
  RevenueTrendSeries,
} from "@/types/metrics";

// Placeholder data used until the metrics service (Phase 2) provides real
// values. Shapes match the real API response types so swapping in live data
// later requires no prop-type changes.

export const mockRevenueTrendSeries: RevenueTrendSeries[] = [
  {
    label: "This Year Revenue",
    unit: "USD",
    points: [
      { period_start: "2025-01-01", period_end: "2025-03-31", value: 4_200_000 },
      { period_start: "2025-04-01", period_end: "2025-06-30", value: 4_650_000 },
      { period_start: "2025-07-01", period_end: "2025-09-30", value: 4_980_000 },
      { period_start: "2025-10-01", period_end: "2025-12-31", value: 5_430_000 },
      { period_start: "2026-01-01", period_end: "2026-03-31", value: 5_120_000 },
    ],
  },
  {
    label: "Prior Year Same Period",
    unit: "USD",
    points: [
      { period_start: "2024-01-01", period_end: "2024-03-31", value: 3_700_000 },
      { period_start: "2024-04-01", period_end: "2024-06-30", value: 3_950_000 },
      { period_start: "2024-07-01", period_end: "2024-09-30", value: 4_260_000 },
      { period_start: "2024-10-01", period_end: "2024-12-31", value: 4_610_000 },
      { period_start: "2025-01-01", period_end: "2025-03-31", value: 4_200_000 },
    ],
  },
];

export const mockMarginBreakdown: MarginBreakdownEntry[] = [
  { period_label: "Q1", grossMarginPct: 58.2, netMarginPct: 12.4 },
  { period_label: "Q2", grossMarginPct: 59.1, netMarginPct: 13.6 },
  { period_label: "Q3", grossMarginPct: 57.8, netMarginPct: 11.9 },
  { period_label: "Q4", grossMarginPct: 60.4, netMarginPct: 14.8 },
];

export const mockCashRunwaySteps: CashRunwayStep[] = [
  { label: "Beginning Cash", value: 3_200_000, type: "total" },
  { label: "Operating Cash Flow", value: 1_450_000, type: "increase" },
  { label: "Capital Expenditure", value: -620_000, type: "decrease" },
  { label: "Financing Activities", value: 800_000, type: "increase" },
  { label: "Debt Repayment", value: -540_000, type: "decrease" },
  { label: "Ending Cash", value: 4_290_000, type: "total" },
];
