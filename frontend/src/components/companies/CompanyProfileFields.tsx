import { Globe } from "lucide-react";

import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

export interface CompanyProfileFormState {
  description: string;
  foundedDate: string;
  websiteUrl: string;
  headquartersLocation: string;
  employeeCountRange: string;
}

export const EMPTY_COMPANY_PROFILE_FORM: CompanyProfileFormState = {
  description: "",
  foundedDate: "",
  websiteUrl: "",
  headquartersLocation: "",
  employeeCountRange: "",
};

const TODAY = new Date().toISOString().split("T")[0];

/** Keyed by the backend schema's own field names (see app/schemas/company.py's
 * CompanyProfileFields) rather than this component's camelCase state, so a
 * caller can pass the 422 field errors (from api/errors.ts's getFieldErrors)
 * straight through without a translation step. */
export interface CompanyProfileFieldErrors {
  description?: string;
  founded_date?: string;
  website_url?: string;
  headquarters_location?: string;
  employee_count_range?: string;
}

interface CompanyProfileFieldsProps {
  /** Namespaces input ids/names so this can be rendered twice on the same page
   * (the Add form and the Edit modal) without id collisions. */
  idPrefix: string;
  values: CompanyProfileFormState;
  onChange: (values: CompanyProfileFormState) => void;
  errors?: CompanyProfileFieldErrors;
}

/** The optional company-profile fields (description, founding date, website,
 * headquarters, size) shared verbatim between the Add Company form and the Edit
 * Company modal so the two never drift apart. All fields are optional. */
export function CompanyProfileFields({ idPrefix, values, onChange, errors }: CompanyProfileFieldsProps) {
  function set(key: keyof CompanyProfileFormState, value: string) {
    onChange({ ...values, [key]: value });
  }

  // Belt-and-braces: the backend strips whitespace on every string field
  // before validation, but trimming here too means a pasted trailing space
  // never round-trips to the server in the first place, and the field
  // visibly cleans itself up as soon as the user tabs away.
  function trimOnBlur(key: keyof CompanyProfileFormState) {
    return () => {
      const trimmed = values[key].trim();
      if (trimmed !== values[key]) set(key, trimmed);
    };
  }

  return (
    <>
      <Textarea
        label="Description"
        name={`${idPrefix}-description`}
        rows={4}
        value={values.description}
        onChange={(e) => set("description", e.target.value)}
        onBlur={trimOnBlur("description")}
        placeholder="Brief description of what this company does"
        error={errors?.description}
      />
      <Input
        label="Founded Date"
        type="date"
        name={`${idPrefix}-foundedDate`}
        value={values.foundedDate}
        onChange={(e) => set("foundedDate", e.target.value)}
        max={TODAY}
        error={errors?.founded_date}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-websiteUrl`} className="text-sm font-medium text-navy">
          Website
        </label>
        <div className="relative">
          <Globe
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id={`${idPrefix}-websiteUrl`}
            type="text"
            name={`${idPrefix}-websiteUrl`}
            value={values.websiteUrl}
            onChange={(e) => set("websiteUrl", e.target.value)}
            onBlur={trimOnBlur("websiteUrl")}
            placeholder="https://example.com"
            aria-invalid={!!errors?.website_url}
            className={`min-h-[44px] w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-sm text-navy outline-none transition-colors focus:ring-1 ${
              errors?.website_url
                ? "border-destructive focus:border-destructive focus:ring-destructive"
                : "border-surface-border focus:border-coral focus:ring-coral"
            }`}
          />
        </div>
        {errors?.website_url && <p className="text-xs text-destructive">{errors.website_url}</p>}
      </div>
      <Input
        label="Headquarters Location"
        name={`${idPrefix}-headquartersLocation`}
        value={values.headquartersLocation}
        onChange={(e) => set("headquartersLocation", e.target.value)}
        onBlur={trimOnBlur("headquartersLocation")}
        placeholder="e.g. Dublin, Ireland"
        error={errors?.headquarters_location}
      />
      <Input
        label="Company Size"
        name={`${idPrefix}-employeeCountRange`}
        value={values.employeeCountRange}
        onChange={(e) => set("employeeCountRange", e.target.value)}
        onBlur={trimOnBlur("employeeCountRange")}
        placeholder="e.g. 50-100 employees"
        error={errors?.employee_count_range}
      />
    </>
  );
}
