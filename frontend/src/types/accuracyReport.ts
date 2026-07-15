/** Mirrors backend app/schemas/accuracy_report.py - the response shape for
 * GET/POST .../accuracy-report (see CompanyDocumentsHubView's Accuracy panel,
 * which is the only consumer). */
export interface AccuracyMismatch {
  period_label: string;
  field: string;
  expected: number;
  // null when the field wasn't extracted at all, distinct from a wrong value.
  got: number | null;
  source_excerpt: string | null;
  source_page: number | null;
  statement_id: string | null;
}

export interface IdentityCheckResult {
  rule_name: string;
  passed: boolean;
  expected: number;
  actual: number;
  delta: number;
}

export interface AccuracyScorecard {
  fields_compared: number;
  exact_matches: number;
  mismatches: AccuracyMismatch[];
  identity_checks_passed: number;
  identity_checks_total: number;
  identity_check_results: IdentityCheckResult[];
  ground_truth_available: boolean;
  ground_truth_fixture: string | null;
}

export interface AccuracyReport {
  id: string;
  document_id: string;
  pipeline_version: string;
  scorecard: AccuracyScorecard;
  created_at: string;
}
