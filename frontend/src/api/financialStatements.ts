import { apiClient } from "@/api/client";
import type {
  FinancialStatement,
  FinancialStatementCreatePayload,
  FinancialStatementHistoryEntry,
} from "@/types/financialStatement";

export async function listFinancialStatements(companyId: string): Promise<FinancialStatement[]> {
  const { data } = await apiClient.get<FinancialStatement[]>(
    `/companies/${companyId}/financial-statements`,
  );
  return data;
}

export async function createFinancialStatement(
  companyId: string,
  payload: FinancialStatementCreatePayload,
): Promise<FinancialStatement> {
  const { data } = await apiClient.post<FinancialStatement>(
    `/companies/${companyId}/financial-statements`,
    payload,
  );
  return data;
}

export async function updateFinancialStatement(
  statementId: string,
  value: number,
): Promise<FinancialStatement> {
  const { data } = await apiClient.patch<FinancialStatement>(
    `/financial-statements/${statementId}`,
    { value },
  );
  return data;
}

export async function getFinancialStatementHistory(
  statementId: string,
): Promise<FinancialStatementHistoryEntry[]> {
  const { data } = await apiClient.get<FinancialStatementHistoryEntry[]>(
    `/financial-statements/${statementId}/history`,
  );
  return data;
}
