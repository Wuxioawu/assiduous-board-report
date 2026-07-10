import type { ReportingFrequency } from "@/types/company";

const REPORTING_FREQUENCY_LABELS: Record<ReportingFrequency, string> = {
  quarterly: "Quarterly",
  half_yearly: "Half-Yearly",
  annual: "Annual",
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SELECT_CLASS =
  "min-h-[44px] w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral";

export interface CompanyCadenceFormState {
  reportingFrequency: ReportingFrequency | "";
  fiscalYearStartMonth: number;
}

export const EMPTY_COMPANY_CADENCE_FORM: CompanyCadenceFormState = {
  reportingFrequency: "",
  fiscalYearStartMonth: 1,
};

interface CompanyReportingCadenceFieldsProps {
  /** Namespaces input ids so this can render on both the Add form and the Edit
   * modal without id collisions, mirroring CompanyProfileFields. */
  idPrefix: string;
  values: CompanyCadenceFormState;
  onChange: (values: CompanyCadenceFormState) => void;
}

/** Optional reporting-cadence fields (frequency + fiscal year start month) that
 * drive the fiscal-period labels shown on period selectors (e.g. "FY2026 H1")
 * instead of raw date ranges - see fiscal_periods.py on the backend. Leaving
 * reportingFrequency unset preserves today's raw-date-range display. */
export function CompanyReportingCadenceFields({ idPrefix, values, onChange }: CompanyReportingCadenceFieldsProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={`${idPrefix}-reportingFrequency`} className="text-sm font-medium text-navy">
          Reporting Frequency
        </label>
        <select
          id={`${idPrefix}-reportingFrequency`}
          name={`${idPrefix}-reportingFrequency`}
          value={values.reportingFrequency}
          onChange={(e) =>
            onChange({ ...values, reportingFrequency: e.target.value as ReportingFrequency | "" })
          }
          className={SELECT_CLASS}
        >
          <option value="">Not set (show raw date range)</option>
          {(Object.entries(REPORTING_FREQUENCY_LABELS) as [ReportingFrequency, string][]).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={`${idPrefix}-fiscalYearStartMonth`} className="text-sm font-medium text-navy">
          Fiscal Year Start Month
        </label>
        <select
          id={`${idPrefix}-fiscalYearStartMonth`}
          name={`${idPrefix}-fiscalYearStartMonth`}
          value={values.fiscalYearStartMonth}
          onChange={(e) => onChange({ ...values, fiscalYearStartMonth: Number(e.target.value) })}
          className={SELECT_CLASS}
        >
          {MONTH_LABELS.map((label, index) => (
            <option key={label} value={index + 1}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
