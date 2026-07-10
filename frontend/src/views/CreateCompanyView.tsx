import { ChevronLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { createCompany, uploadCompanyLogo } from "@/api/companies";
import { getErrorDetail } from "@/api/errors";
import { CompanyLogoStager } from "@/components/companies/CompanyLogoStager";
import {
  CompanyProfileFields,
  EMPTY_COMPANY_PROFILE_FORM,
  type CompanyProfileFormState,
} from "@/components/companies/CompanyProfileFields";
import {
  CompanyReportingCadenceFields,
  EMPTY_COMPANY_CADENCE_FORM,
  type CompanyCadenceFormState,
} from "@/components/companies/CompanyReportingCadenceFields";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { canManageOrg } from "@/lib/roles";

export function CreateCompanyView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canManage = !!user && canManageOrg(user.role);

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [profile, setProfile] = useState<CompanyProfileFormState>(EMPTY_COMPANY_PROFILE_FORM);
  const [cadence, setCadence] = useState<CompanyCadenceFormState>(EMPTY_COMPANY_CADENCE_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user && !canManage) {
    return <Navigate to="/companies" replace />;
  }
  if (!user) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const company = await createCompany({
        name,
        industry: industry || null,
        description: profile.description || null,
        founded_date: profile.foundedDate || null,
        website_url: profile.websiteUrl || null,
        headquarters_location: profile.headquartersLocation || null,
        employee_count_range: profile.employeeCountRange || null,
        reporting_frequency: cadence.reportingFrequency || null,
        fiscal_year_start_month: cadence.fiscalYearStartMonth,
      });

      // Design choice (item 4 in the task): approach (a), not (b) - the company
      // doesn't exist yet while the user is picking a logo, so CompanyLogoStager
      // only stages the file client-side (preview via object URL). The company
      // row is created first via the existing POST /companies, then the staged
      // file is uploaded via the existing POST /companies/{id}/logo using the
      // new id, all before navigating away. This keeps Cancel a pure no-op
      // (nothing is ever persisted before Save is clicked) rather than needing
      // to reconcile/delete a speculative row if the user abandons the form,
      // which is the exact risk approach (b) warns against.
      if (logoFile) {
        try {
          await uploadCompanyLogo(company.id, logoFile);
        } catch {
          // The company itself was created successfully; don't block navigation
          // on a logo upload failure - land on the detail page, where the logo
          // can simply be retried. Previously silent, though - the user would
          // otherwise have no way to know the logo didn't actually save.
          showToast("Company created, but the logo didn't upload — you can retry it from the company page.", "info");
        }
      }

      navigate(`/companies/${company.id}`);
    } catch (err) {
      setError(getErrorDetail(err, "Failed to create company"));
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <Link
        to="/companies"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-navy"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Companies
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-navy">Add Company</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Create a new company to start tracking its financials.
      </p>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <CompanyLogoStager companyName={name} file={logoFile} onFileChange={setLogoFile} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                label="Company Name"
                name="companyName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Senus PLC"
                autoFocus
                required
              />
            </div>
            <div className="flex-1">
              <Input
                label="Industry"
                name="companyIndustry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Natural Capital / Climate Tech"
              />
            </div>
          </div>
          <CompanyProfileFields idPrefix="create" values={profile} onChange={setProfile} />
          <CompanyReportingCadenceFields idPrefix="create" values={cadence} onChange={setCadence} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate("/companies")}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
