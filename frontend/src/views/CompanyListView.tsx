import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { listCompanies } from "@/api/companies";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { canManageOrg } from "@/lib/roles";
import type { Company } from "@/types/company";

export function CompanyListView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = !!user && canManageOrg(user.role);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCompanies()
      .then(setCompanies)
      .catch(() => setError("Failed to load company list"))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy">Companies</h1>
        {user && (
          <Button
            onClick={() => navigate("/companies/new")}
            disabled={!canManage}
            title={canManage ? undefined : "Only an Owner or Admin can add a company"}
          >
            Add Company
          </Button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : companies.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No companies added yet. Click "Add Company" in the top right to get started.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Link
              key={company.id}
              to={`/companies/${company.id}`}
              className="flex flex-col gap-3 rounded-xl border border-surface-border bg-white p-6 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
            >
              <CompanyLogo logoUrl={company.logo_url} companyName={company.name} size="md" />
              <div>
                <h3 className="text-base font-semibold text-navy">{company.name}</h3>
                <p className="mt-1 text-sm text-muted">
                  {company.industry ?? "Industry not set"} · {company.currency}
                </p>
              </div>
              {company.description && (
                <p className="line-clamp-2 text-sm leading-relaxed text-muted">{company.description}</p>
              )}
              {company.headquarters_location && (
                <p className="text-xs font-medium text-muted">{company.headquarters_location}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
