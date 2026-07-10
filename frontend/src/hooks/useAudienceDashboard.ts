import { useCallback, useEffect, useRef, useState } from "react";

import { getCompany } from "@/api/companies";
import { classifyError, type ErrorKind } from "@/api/errors";
import { getInsight, regenerateInsight } from "@/api/insights";
import { getMetrics, getMetricsHistory } from "@/api/metrics";
import type { Company } from "@/types/company";
import type { Audience, Insight } from "@/types/insight";
import type { MetricHistoryResponse, MetricsResponse } from "@/types/metrics";

interface UseAudienceDashboardResult {
  company: Company | null;
  metrics: MetricsResponse | null;
  history: MetricHistoryResponse | null;
  insight: Insight | null;
  // True only on the very first load for this company (nothing to show yet) -
  // callers should render a full-page loading state.
  isLoading: boolean;
  // True while re-fetching after an audience/period switch, with the previous
  // content still current in state - callers should keep rendering it and show
  // a lightweight "updating" indicator instead of blanking the page.
  isRefreshing: boolean;
  error: string | null;
  errorKind: ErrorKind | null;
  regenerate: (confirmOverwriteEdit?: boolean) => Promise<void>;
  refetch: () => Promise<void>;
  // Lets InsightPanel push the result of an edit/revert straight into this hook's
  // state, without a full refetch, the same way `regenerate` already does.
  setInsight: (insight: Insight) => void;
}

const ERROR_MESSAGES: Record<ErrorKind, string> = {
  network: "Couldn't reach the server. Check your connection and try again.",
  "not-found": "No extracted financial data available for this company yet.",
  unauthorized: "You don't have access to this company's data.",
  unknown: "Something went wrong loading this dashboard.",
};

export function useAudienceDashboard(
  companyId: string | undefined,
  audience: Audience,
  historyKeys: string[],
  period?: string,
): UseAudienceDashboardResult {
  const [company, setCompany] = useState<Company | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [history, setHistory] = useState<MetricHistoryResponse | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const historyKeysDep = historyKeys.join(",");
  // Guards against a stale request (e.g. an earlier refetch still in flight)
  // clobbering the result of a newer one.
  const requestIdRef = useRef(0);
  // Whether this company has ever finished loading once - drives the
  // loading-vs-refreshing distinction above.
  const hasLoadedOnceRef = useRef(false);

  // A genuinely different company means the previously-loaded data is no
  // longer relevant (and could be mistaken for the new company's data if left
  // on screen during a "refreshing" state) - reset back to a full loading
  // state rather than treating this like an audience/period switch.
  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setCompany(null);
    setMetrics(null);
    setHistory(null);
    setInsight(null);
  }, [companyId]);

  const fetchAll = useCallback(async () => {
    if (!companyId) return;
    const requestId = ++requestIdRef.current;
    if (hasLoadedOnceRef.current) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    setErrorKind(null);
    try {
      // Fetched separately from metrics/history/insight: the company record itself
      // loads almost instantly and should render (e.g. in the page header) even while
      // extraction is still in progress and the metrics/history calls below are
      // expected to 404.
      const companyData = await getCompany(companyId);
      if (requestIdRef.current !== requestId) return;
      setCompany(companyData);

      const [metricsData, historyData] = await Promise.all([
        getMetrics(companyId, period),
        historyKeysDep ? getMetricsHistory(companyId, historyKeysDep.split(",")) : Promise.resolve(null),
      ]);
      if (requestIdRef.current !== requestId) return;
      setMetrics(metricsData);
      setHistory(historyData);

      // A 404 here means "no insight generated yet for this audience/period" -
      // a legitimate, expected state, not a failure. Anything else (network,
      // 500) is a real error and should surface as one instead of silently
      // rendering identically to "nothing generated yet".
      try {
        const insightData = await getInsight(companyId, audience, period);
        if (requestIdRef.current !== requestId) return;
        setInsight(insightData);
      } catch (insightErr) {
        if (classifyError(insightErr) !== "not-found") throw insightErr;
        if (requestIdRef.current !== requestId) return;
        setInsight(null);
      }
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      const kind = classifyError(err);
      setErrorKind(kind);
      setError(ERROR_MESSAGES[kind]);
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
        setIsRefreshing(false);
        hasLoadedOnceRef.current = true;
      }
    }
  }, [companyId, audience, historyKeysDep, period]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const regenerate = useCallback(
    async (confirmOverwriteEdit?: boolean) => {
      if (!companyId) return;
      const updated = await regenerateInsight(companyId, audience, period, confirmOverwriteEdit);
      setInsight(updated);
    },
    [companyId, audience, period],
  );

  return {
    company,
    metrics,
    history,
    insight,
    isLoading,
    isRefreshing,
    error,
    errorKind,
    regenerate,
    refetch: fetchAll,
    setInsight,
  };
}
