import { useEffect, useRef, useState } from "react";
import { FileDown } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";

import { getCompanyPeriods } from "@/api/companies";
import { AppShell } from "@/components/layout/AppShell";
import { AudienceSwitcher } from "@/components/layout/AudienceSwitcher";
import { ExportModal } from "@/components/export/ExportModal";
import { InsightPanel } from "@/components/insights/InsightPanel";
import { PeriodSelector } from "@/components/report/PeriodSelector";
import { FailedDocumentsNotice, NoDataYet, ProcessingStatus } from "@/components/report/ReportStatusPanels";
import {
  BoardSection,
  BudgetVarianceSection,
  CreditSection,
  EquitySection,
  ManagementSection,
} from "@/components/report/AudienceSections";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useAudienceDashboard } from "@/hooks/useAudienceDashboard";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentStatus } from "@/hooks/useDocumentStatus";
import { buildEbitdaToFcfBridge, buildMarginBreakdown, buildRevenueTrendSeries } from "@/lib/dashboardData";
import { formatPeriodDateRange } from "@/lib/periods";
import type { CompanyPeriod } from "@/types/company";
import type { Audience } from "@/types/insight";

const VALID_AUDIENCES: Audience[] = ["management", "board", "equity", "credit"];

const AUDIENCE_TITLES: Record<Audience, string> = {
  management: "Management View",
  board: "Board View",
  equity: "Equity Investor View",
  credit: "Credit Provider View",
};

const HISTORY_KEYS_BY_AUDIENCE: Record<Audience, string[]> = {
  management: ["revenue", "gross_margin", "net_margin"],
  board: ["revenue", "gross_margin", "net_margin"],
  equity: ["revenue", "gross_margin", "net_margin"],
  credit: [],
};

function parseAudience(value: string | null): Audience {
  return VALID_AUDIENCES.includes(value as Audience) ? (value as Audience) : "management";
}

export function ReportView() {
  const { user } = useAuth();
  const { companyId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const audience = parseAudience(searchParams.get("audience"));
  const [periods, setPeriods] = useState<CompanyPeriod[]>([]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    getCompanyPeriods(companyId)
      .then((data) => {
        if (!cancelled) setPeriods(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const requestedPeriod = searchParams.get("period");
  const selectedPeriod =
    requestedPeriod && periods.some((p) => p.period_end === requestedPeriod)
      ? requestedPeriod
      : periods[0]?.period_end;
  const selectedPeriodInfo = periods.find((p) => p.period_end === selectedPeriod);
  const selectedPeriodLabel = selectedPeriodInfo
    ? selectedPeriodInfo.fiscal_label
      ? `${selectedPeriodInfo.fiscal_label} (${formatPeriodDateRange(selectedPeriodInfo.period_start, selectedPeriodInfo.period_end)})`
      : `${selectedPeriodInfo.period_start} → ${selectedPeriodInfo.period_end}`
    : undefined;

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  function handlePeriodChange(periodEnd: string) {
    const next = new URLSearchParams(searchParams);
    next.set("period", periodEnd);
    setSearchParams(next);
  }

  const {
    company,
    metrics,
    history,
    insight,
    isLoading,
    isRefreshing,
    error,
    regenerate,
    refetch,
    setInsight,
  } = useAudienceDashboard(companyId, audience, HISTORY_KEYS_BY_AUDIENCE[audience], selectedPeriod);

  const { documents, documentsLoaded, isProcessing, elapsedMs } = useDocumentStatus(companyId);

  // As soon as extraction finishes (isProcessing flips false), reload the dashboard so
  // the real charts/metrics appear automatically, with no manual refresh.
  const wasProcessingRef = useRef(false);
  useEffect(() => {
    if (wasProcessingRef.current && !isProcessing) {
      refetch();
    }
    wasProcessingRef.current = isProcessing;
  }, [isProcessing, refetch]);

  const currency = metrics?.currency ?? company?.currency ?? "USD";
  const revenueSeries = buildRevenueTrendSeries(history);
  const marginData = buildMarginBreakdown(history);
  const bridgeSteps = buildEbitdaToFcfBridge(metrics);

  const hasNoDocuments = documentsLoaded && documents.length === 0;
  // isLoading (first load for this company) blanks the page; isRefreshing (an
  // audience/period switch with a previous result already on screen) does not -
  // reportState stays "ready" and the still-current content keeps rendering
  // while a small "Updating…" indicator shows the fetch in flight, instead of
  // every switch flashing the page blank and rebuilding it from scratch.
  const reportState: "loading" | "processing" | "no-data" | "error" | "ready" = !documentsLoaded
    ? "loading"
    : isProcessing
      ? "processing"
      : hasNoDocuments
        ? "no-data"
        : error
          ? "error"
          : isLoading
            ? "loading"
            : "ready";

  return (
    <AppShell>
      <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-navy">{AUDIENCE_TITLES[audience]}</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {periods.length > 0 && (
            <PeriodSelector periods={periods} selected={selectedPeriod} onChange={handlePeriodChange} />
          )}
          {companyId && reportState === "ready" && (
            <Button variant="secondary" onClick={() => setIsExportModalOpen(true)} className="w-full sm:w-auto">
              <FileDown className="mr-2 h-5 w-5" aria-hidden="true" />
              Export Report
            </Button>
          )}
        </div>
      </div>
      {companyId && isExportModalOpen && (
        <ExportModal
          companyId={companyId}
          initialAudience={audience}
          period={selectedPeriod}
          periodLabel={selectedPeriodLabel}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}
      <p className="mb-4 flex items-center gap-2 text-sm text-muted">
        {company ? (
          company.name
        ) : (
          <>
            <Spinner className="h-4 w-4 text-muted" />
            Loading company…
          </>
        )}
      </p>
      <AudienceSwitcher activeAudience={audience} />

      {companyId && <FailedDocumentsNotice documents={documents} companyId={companyId} />}

      {reportState === "loading" && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      )}
      {reportState === "processing" && companyId && (
        <ProcessingStatus documents={documents} companyId={companyId} elapsedMs={elapsedMs} />
      )}
      {reportState === "no-data" && companyId && <NoDataYet companyId={companyId} />}
      {reportState === "error" && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="secondary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {reportState === "ready" && (
        <>
          {isRefreshing && (
            <p className="mb-3 flex items-center gap-2 text-xs text-muted">
              <Spinner className="h-3.5 w-3.5" />
              Updating…
            </p>
          )}
          {audience === "management" && (
            <ManagementSection
              metrics={metrics}
              companyName={company?.name}
              companyId={companyId}
              currency={currency}
              revenueSeries={revenueSeries}
              marginData={marginData}
              bridgeSteps={bridgeSteps}
            />
          )}
          {audience === "board" && (
            <BoardSection
              metrics={metrics}
              companyName={company?.name}
              companyId={companyId}
              currency={currency}
              revenueSeries={revenueSeries}
              marginData={marginData}
            />
          )}
          {audience === "equity" && (
            <EquitySection
              metrics={metrics}
              companyName={company?.name}
              companyId={companyId}
              currency={currency}
              revenueSeries={revenueSeries}
              marginData={marginData}
            />
          )}
          {audience === "credit" && (
            <CreditSection
              metrics={metrics}
              companyName={company?.name}
              companyId={companyId}
              currency={currency}
              bridgeSteps={bridgeSteps}
            />
          )}

          <BudgetVarianceSection metrics={metrics} currency={currency} />

          {companyId && (
            <InsightPanel
              insight={insight}
              onRegenerate={regenerate}
              onInsightChange={setInsight}
              companyId={companyId}
              audience={audience}
              period={selectedPeriod}
              user={user}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
