export interface Company {
  id: string;
  organization_id: string;
  name: string;
  industry: string | null;
  fiscal_year_end: string | null;
  currency: string;
}

export interface CompanyCreatePayload {
  name: string;
  industry?: string | null;
  fiscal_year_end?: string | null;
  currency?: string;
}
