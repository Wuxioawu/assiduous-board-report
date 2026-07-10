import { BarChart3, Building2, Calendar, FileText, Globe, Pencil, Target, Trash2, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { deleteCompany, getCompany, updateCompany } from "@/api/companies";
import { getErrorDetail } from "@/api/errors";
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
import { CompanyLogoUploader } from "@/components/companies/CompanyLogoUploader";
import { HubTile } from "@/components/companies/HubTile";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { canEditData, canManageOrg } from "@/lib/roles";
import type { Company } from "@/types/company";

function formatFoundedDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function CompanyDetailView() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = !!user && canManageOrg(user.role);
  const canEdit = !!user && canEditData(user.role);

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editProfile, setEditProfile] = useState<CompanyProfileFormState>(EMPTY_COMPANY_PROFILE_FORM);
  const [editCadence, setEditCadence] = useState<CompanyCadenceFormState>(EMPTY_COMPANY_CADENCE_FORM);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const {
    pendingItem: pendingDelete,
    isDeleting,
    error: deleteError,
    requestDelete: requestDeleteCompany,
    cancel: closeDeleteModal,
    confirm: confirmDelete,
  } = useConfirmDelete<Company>(async (target) => {
    await deleteCompany(target.id);
    navigate("/companies");
  }, "Failed to delete company, please try again");

  useEffect(() => {
    if (!companyId) return;
    getCompany(companyId)
      .then(setCompany)
      .catch(() => setLoadError("Failed to load company"))
      .finally(() => setIsLoading(false));
  }, [companyId]);

  function openEditModal() {
    if (!company) return;
    setEditName(company.name);
    setEditIndustry(company.industry ?? "");
    setEditProfile({
      description: company.description ?? "",
      foundedDate: company.founded_date ?? "",
      websiteUrl: company.website_url ?? "",
      headquartersLocation: company.headquarters_location ?? "",
      employeeCountRange: company.employee_count_range ?? "",
    });
    setEditCadence({
      reportingFrequency: company.reporting_frequency ?? "",
      fiscalYearStartMonth: company.fiscal_year_start_month,
    });
    setEditError(null);
    setIsEditOpen(true);
  }

  function closeEditModal() {
    if (isSavingEdit) return;
    setIsEditOpen(false);
    setEditError(null);
  }

  async function confirmEdit() {
    if (!company) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const updated = await updateCompany(company.id, {
        name: editName,
        industry: editIndustry || null,
        description: editProfile.description || null,
        founded_date: editProfile.foundedDate || null,
        website_url: editProfile.websiteUrl || null,
        headquarters_location: editProfile.headquartersLocation || null,
        employee_count_range: editProfile.employeeCountRange || null,
        reporting_frequency: editCadence.reportingFrequency || null,
        fiscal_year_start_month: editCadence.fiscalYearStartMonth,
      });
      setCompany(updated);
      setIsEditOpen(false);
    } catch (err) {
      setEditError(getErrorDetail(err, "Failed to save changes, please try again"));
    } finally {
      setIsSavingEdit(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      </AppShell>
    );
  }

  if (loadError || !company) {
    return (
      <AppShell>
        <p className="text-sm text-destructive">{loadError ?? "Company not found"}</p>
      </AppShell>
    );
  }

  const hasProfileDetails = Boolean(
    company.founded_date || company.website_url || company.headquarters_location || company.employee_count_range,
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {/* Display-only here - logo changes now live in the Edit Company form. */}
          <CompanyLogo logoUrl={company.logo_url} companyName={company.name} size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-navy">{company.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {company.industry ?? "Industry not set"} · {company.currency}
            </p>
          </div>
        </div>
        {user && (
          // Rendered (disabled + tooltip) rather than hidden for non-managers, so
          // the restriction is visible/explained rather than the buttons just
          // silently not existing.
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              onClick={openEditModal}
              disabled={!canManage}
              title={canManage ? undefined : "Only an Owner or Admin can edit this company"}
              className="flex items-center gap-1.5"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </Button>
            <Button
              variant="danger"
              onClick={() => requestDeleteCompany(company)}
              disabled={!canManage}
              title={canManage ? undefined : "Only an Owner or Admin can delete this company"}
              className="flex items-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <Card className="mb-6">
        {company.description && (
          <p className="mb-4 text-sm leading-relaxed text-navy">{company.description}</p>
        )}
        {hasProfileDetails ? (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            {company.founded_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                Founded {formatFoundedDate(company.founded_date)}
              </span>
            )}
            {company.website_url && (
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
                <a
                  href={company.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-coral transition-colors hover:underline"
                >
                  {company.website_url}
                </a>
              </span>
            )}
            {company.headquarters_location && (
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {company.headquarters_location}
              </span>
            )}
            {company.employee_count_range && (
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                {company.employee_count_range}
              </span>
            )}
          </div>
        ) : (
          !company.description && (
            <p className="text-sm text-muted">
              No additional company details yet.
              {canManage ? " Click Edit to add a description, founding date, website, and more." : ""}
            </p>
          )
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <HubTile
          to={`/companies/${company.id}/documents`}
          icon={<FileText className="h-5 w-5" aria-hidden="true" />}
          title="Documents"
          description="Upload filings and review the financial data extracted from them."
        />
        <HubTile
          to={`/companies/${company.id}/report`}
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
          title="Report"
          description="The AI-generated board report across Management, Board, Equity, and Credit views."
        />
        {canEdit && (
          <HubTile
            to={`/companies/${company.id}/budget`}
            icon={<Target className="h-5 w-5" aria-hidden="true" />}
            title="Budget"
            description="Set budget targets and track variance against actuals."
          />
        )}
        {canManage && (
          <HubTile
            to={`/companies/${company.id}/benchmarks`}
            icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
            title="Benchmarks"
            description="Compare this company's performance against industry benchmarks."
          />
        )}
      </div>

      {isEditOpen && (
        <Modal
          title="Edit Company"
          onClose={closeEditModal}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeEditModal} disabled={isSavingEdit}>
                Cancel
              </Button>
              <Button onClick={confirmEdit} disabled={isSavingEdit || !editName.trim()}>
                {isSavingEdit ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <CompanyLogoUploader
              company={company}
              editable
              onLogoChange={(logoUrl) => setCompany((prev) => (prev ? { ...prev, logo_url: logoUrl } : prev))}
            />
            <Input
              label="Company Name"
              name="editCompanyName"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
            <Input
              label="Industry"
              name="editCompanyIndustry"
              value={editIndustry}
              onChange={(e) => setEditIndustry(e.target.value)}
              placeholder="e.g. Natural Capital / Climate Tech"
            />
            <CompanyProfileFields idPrefix="edit" values={editProfile} onChange={setEditProfile} />
            <CompanyReportingCadenceFields idPrefix="edit" values={editCadence} onChange={setEditCadence} />
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <Modal title="Delete Company" onClose={closeDeleteModal}>
          <div className="mb-4 space-y-2 text-sm text-navy">
            <p>
              Delete <span className="font-semibold text-navy">{company.name}</span>?
            </p>
            <p className="text-xs text-muted">
              All associated documents, extracted financial data, metrics, and AI insights will be
              permanently deleted. This cannot be undone.
            </p>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDeleteModal} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete Company"}
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
