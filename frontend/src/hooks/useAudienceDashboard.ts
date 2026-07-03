import { useCallback, useEffect, useState } from "react";

import { getCompany } from "@/api/companies";
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
  isLoading: boolean;
  error: string | null;
  regenerate: () => Promise<void>;
}

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
  const [error, setError] = useState<string | null>(null);
  const historyKeysDep = historyKeys.join(",");

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const [companyData, metricsData, historyData] = await Promise.all([
          getCompany(companyId),
          getMetrics(companyId, period),
          historyKeysDep ? getMetricsHistory(companyId, historyKeysDep.split(",")) : Promise.resolve(null),
        ]);
        const insightData = await getInsight(companyId, audience, period).catch(() => null);
        if (cancelled) return;
        setCompany(companyData);
        setMetrics(metricsData);
        setHistory(historyData);
        setInsight(insightData);
      } catch {
        if (!cancelled) {
          setError("Failed to load dashboard data. Make sure this company has extracted financial data.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, audience, historyKeysDep, period]);

  const regenerate = useCallback(async () => {
    if (!companyId) return;
    const updated = await regenerateInsight(companyId, audience, period);
    setInsight(updated);
  }, [companyId, audience, period]);

  return { company, metrics, history, insight, isLoading, error, regenerate };
}
