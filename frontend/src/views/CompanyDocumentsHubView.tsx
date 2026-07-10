import { ChevronLeft, FileStack, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getCompany } from "@/api/companies";
import { listDocuments } from "@/api/documents";
import { listFinancialStatements } from "@/api/financialStatements";
import { HubTile } from "@/components/companies/HubTile";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/Spinner";
import type { Company } from "@/types/company";
import type { CompanyDocument } from "@/types/document";
import type { FinancialStatement } from "@/types/financialStatement";

export function CompanyDocumentsHubView() {
  const { companyId } = useParams<{ companyId: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [documents, setDocuments] = useState<CompanyDocument[] | null>(null);
  const [statements, setStatements] = useState<FinancialStatement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    getCompany(companyId)
      .then(setCompany)
      .catch(() => setError("Failed to load company"));
    Promise.all([listDocuments(companyId), listFinancialStatements(companyId)])
      .then(([documentsData, statementsData]) => {
        setDocuments(documentsData);
        setStatements(statementsData);
      })
      .catch(() => setError("Failed to load summary"));
  }, [companyId]);

  const isLoading = documents === null || statements === null;
  const extractedCount = documents?.filter((d) => d.status === "extracted").length ?? 0;
  const distinctPeriods = new Set((statements ?? []).map((s) => `${s.period_start}|${s.period_end}`)).size;

  return (
    <AppShell>
      <Link
        to={`/companies/${companyId}`}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-navy"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {company?.name ?? "Company"}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-navy">
        Documents{company ? ` · ${company.name}` : ""}
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Manage source filings and the financial data extracted from them.
      </p>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <HubTile
            to={`/companies/${companyId}/documents/ingestion`}
            icon={<FileStack className="h-5 w-5" aria-hidden="true" />}
            title="Document Ingestion"
            description="Upload filings manually, or configure automated fetching from an investor-relations page."
            summary={
              documents!.length === 0
                ? "No documents yet"
                : `${documents!.length} document${documents!.length === 1 ? "" : "s"}, ${extractedCount} extracted`
            }
          />
          <HubTile
            to={`/companies/${companyId}/documents/financial-data`}
            icon={<Table2 className="h-5 w-5" aria-hidden="true" />}
            title="Financial Data"
            description="Review every extracted line item, add missing figures, or correct an extracted value."
            summary={
              statements!.length === 0
                ? "No line items yet"
                : `${statements!.length} line item${statements!.length === 1 ? "" : "s"} across ${distinctPeriods} period${distinctPeriods === 1 ? "" : "s"}`
            }
          />
        </div>
      )}
    </AppShell>
  );
}
