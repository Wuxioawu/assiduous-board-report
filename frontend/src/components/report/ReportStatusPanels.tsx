import { AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IndeterminateProgressBar } from "@/components/ui/ProgressBar";
import { Spinner } from "@/components/ui/Spinner";
import { IN_PROGRESS_DOCUMENT_STATUSES, type CompanyDocument } from "@/types/document";

const SLOW_PROCESSING_THRESHOLD_MS = 3 * 60 * 1000;

export function ProcessingStatus({
  documents,
  companyId,
  elapsedMs,
}: {
  documents: CompanyDocument[];
  companyId: string;
  elapsedMs: number;
}) {
  const activeDocument = documents.find((doc) => IN_PROGRESS_DOCUMENT_STATUSES.includes(doc.status));
  const isSlow = elapsedMs > SLOW_PROCESSING_THRESHOLD_MS;

  return (
    <Card>
      <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
        <Spinner className="h-8 w-8 text-coral" />
        <div>
          <h2 className="text-base font-semibold text-navy">
            Analyzing your financial documents…
          </h2>
          <p className="mt-1 text-sm text-muted">
            AI is extracting financial data from{" "}
            <span className="font-medium text-navy">
              {activeDocument?.filename ?? "your document"}
            </span>
            . This usually takes 1-3 minutes.
          </p>
        </div>
        <div className="w-full max-w-sm">
          <IndeterminateProgressBar />
        </div>
        {isSlow && (
          <p className="text-sm text-[var(--status-warning)]">
            This is taking longer than usual. You can wait, or check the{" "}
            <Link to={`/companies/${companyId}/documents`} className="font-medium underline">
              Documents page
            </Link>{" "}
            for details.
          </p>
        )}
      </div>
    </Card>
  );
}

export function NoDataYet({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  return (
    <Card>
      <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
        <p className="text-sm text-muted">
          No financial data yet. Upload a document to get started.
        </p>
        <Button onClick={() => navigate(`/companies/${companyId}/documents`)}>Go to Documents</Button>
      </div>
    </Card>
  );
}

// Shown whenever any document has failed extraction, regardless of reportState -
// a failed document can sit alongside older successfully-extracted periods (so
// the report still renders "ready" with real, if stale, data) with nothing else
// on this page ever mentioning the failure. Previously the only place this was
// surfaced at all was a small "(why?)" tooltip on the Documents table.
export function FailedDocumentsNotice({
  documents,
  companyId,
}: {
  documents: CompanyDocument[];
  companyId: string;
}) {
  const failedDocuments = documents.filter((doc) => doc.status === "failed");
  if (failedDocuments.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">
            {failedDocuments.length === 1
              ? `"${failedDocuments[0].filename}" couldn't be processed.`
              : `${failedDocuments.length} documents couldn't be processed.`}
          </p>
          <p className="mt-0.5">
            The data shown below may be incomplete or out of date as a result.{" "}
            <Link to={`/companies/${companyId}/documents`} className="font-medium underline">
              View details and retry
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
