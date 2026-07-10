import { apiClient } from "@/api/client";
import type { BudgetEntry, BudgetEntryInput, BudgetPeriodSummary } from "@/types/budget";

export async function listBudgets(companyId: string, period: string): Promise<BudgetEntry[]> {
  const { data } = await apiClient.get<BudgetEntry[]>(`/companies/${companyId}/budgets`, {
    params: { period },
  });
  return data;
}

export async function listAllBudgets(companyId: string): Promise<BudgetPeriodSummary[]> {
  const { data } = await apiClient.get<BudgetPeriodSummary[]>(`/companies/${companyId}/budgets`);
  return data;
}

export async function setBudgets(
  companyId: string,
  periodStart: string,
  periodEnd: string,
  entries: BudgetEntryInput[],
): Promise<BudgetEntry[]> {
  const { data } = await apiClient.post<BudgetEntry[]>(`/companies/${companyId}/budgets`, {
    period_start: periodStart,
    period_end: periodEnd,
    entries,
  });
  return data;
}

export async function deleteBudgets(companyId: string, periodEnd: string): Promise<void> {
  await apiClient.delete(`/companies/${companyId}/budgets`, { params: { period: periodEnd } });
}
