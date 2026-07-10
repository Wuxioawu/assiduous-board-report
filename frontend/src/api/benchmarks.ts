import { apiClient } from "@/api/client";
import type { IndustryBenchmark, IndustryBenchmarkUpsertPayload } from "@/types/benchmark";

export async function listBenchmarks(industry: string): Promise<IndustryBenchmark[]> {
  const { data } = await apiClient.get<IndustryBenchmark[]>("/organizations/benchmarks", {
    params: { industry },
  });
  return data;
}

export async function setBenchmark(payload: IndustryBenchmarkUpsertPayload): Promise<IndustryBenchmark> {
  const { data } = await apiClient.post<IndustryBenchmark>("/organizations/benchmarks", payload);
  return data;
}

export async function deleteBenchmark(benchmarkId: string): Promise<void> {
  await apiClient.delete(`/organizations/benchmarks/${benchmarkId}`);
}
