import { apiClient } from "@/api/client";
import type { FinancialStatement } from "@/types/financialStatement";

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
