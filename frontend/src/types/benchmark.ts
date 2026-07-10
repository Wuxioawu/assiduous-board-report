export interface IndustryBenchmark {
  id: string;
  industry: string;
  metric_key: string;
  period_label: string;
  benchmark_value: number;
  source: string;
  created_by_user_id: string | null;
  created_at: string;
}

export interface IndustryBenchmarkUpsertPayload {
  industry: string;
  metric_key: string;
  period_label: string;
  benchmark_value: number;
  source: string;
}
