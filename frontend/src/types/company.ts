import type { PeriodLabelFields } from "@/types/metrics";

export type ReportingFrequency = "quarterly" | "half_yearly" | "annual";

export interface Company {
  id: string;
  organization_id: string;
  name: string;
  industry: string | null;
  fiscal_year_end: string | null;
  currency: string;
  reporting_frequency: ReportingFrequency | null;
  fiscal_year_start_month: number;
  investor_relations_url: string | null;
  auto_fetch_enabled: boolean;
  last_fetch_checked_at: string | null;
  last_fetch_result: string | null;
  description: string | null;
  founded_date: string | null;
  website_url: string | null;
  headquarters_location: string | null;
  employee_count_range: string | null;
  logo_url: string | null;
}

export interface CompanyLogoResponse {
  logo_url: string | null;
}

export interface CompanyProfileFields {
  description?: string | null;
  founded_date?: string | null;
  website_url?: string | null;
  headquarters_location?: string | null;
  employee_count_range?: string | null;
}

export interface CompanyCreatePayload extends CompanyProfileFields {
  name: string;
  industry?: string | null;
  fiscal_year_end?: string | null;
  currency?: string;
  reporting_frequency?: ReportingFrequency | null;
  fiscal_year_start_month?: number;
}

export interface CompanyUpdatePayload extends CompanyProfileFields {
  name?: string;
  industry?: string | null;
  investor_relations_url?: string | null;
  auto_fetch_enabled?: boolean;
  reporting_frequency?: ReportingFrequency | null;
  fiscal_year_start_month?: number;
}

// Extends PeriodLabelFields so a CompanyPeriod can be passed straight into
// lib/periods.formatPeriodLabel - see types/metrics.ts.
export interface CompanyPeriod extends PeriodLabelFields {
  period_start: string;
}

export interface CompanyFetchResult {
  found_new: number;
  message: string;
  last_fetch_checked_at: string | null;
  auto_fetch_enabled: boolean;
}
