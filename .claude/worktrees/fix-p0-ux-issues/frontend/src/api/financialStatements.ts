import { apiClient } from "@/api/client";
import type { FinancialStatement, FinancialStatementAuditEntry } from "@/types/financialStatement";

export async function listFinancialStatements(companyId: string): Promise<FinancialStatement[]> {
  const { data } = await apiClient.get<FinancialStatement[]>(
    `/companies/${companyId}/financial-statements`,
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

export async function listFinancialStatementAuditLog(
  statementId: string,
): Promise<FinancialStatementAuditEntry[]> {
  const { data } = await apiClient.get<FinancialStatementAuditEntry[]>(
    `/financial-statements/${statementId}/audit-log`,
  );
  return data;
}
