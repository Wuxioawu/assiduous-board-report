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

interface CompanyProfileFieldsProps {
  /** Namespaces input ids/names so this can be rendered twice on the same page
   * (the Add form and the Edit modal) without id collisions. */
  idPrefix: string;
  values: CompanyProfileFormState;
  onChange: (values: CompanyProfileFormState) => void;
}

/** The optional company-profile fields (description, founding date, website,
 * headquarters, size) shared verbatim between the Add Company form and the Edit
 * Company modal so the two never drift apart. All fields are optional. */
export function CompanyProfileFields({ idPrefix, values, onChange }: CompanyProfileFieldsProps) {
  function set(key: keyof CompanyProfileFormState, value: string) {
    onChange({ ...values, [key]: value });
  }

  return (
    <>
      <Textarea
        label="Description"
        name={`${idPrefix}-description`}
        rows={4}
        value={values.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Brief description of what this company does"
      />
      <Input
        label="Founded Date"
        type="date"
        name={`${idPrefix}-foundedDate`}
        value={values.foundedDate}
        onChange={(e) => set("foundedDate", e.target.value)}
        max={TODAY}
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
            placeholder="https://example.com"
            className="min-h-[44px] w-full rounded-lg border border-surface-border bg-white py-2 pl-9 pr-3 text-sm text-navy outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral"
          />
        </div>
      </div>
      <Input
        label="Headquarters Location"
        name={`${idPrefix}-headquartersLocation`}
        value={values.headquartersLocation}
        onChange={(e) => set("headquartersLocation", e.target.value)}
        placeholder="e.g. Dublin, Ireland"
      />
      <Input
        label="Company Size"
        name={`${idPrefix}-employeeCountRange`}
        value={values.employeeCountRange}
        onChange={(e) => set("employeeCountRange", e.target.value)}
        placeholder="e.g. 50-100 employees"
      />
    </>
  );
}
