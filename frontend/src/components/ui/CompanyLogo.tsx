import { Building2 } from "lucide-react";

import { API_BASE_URL } from "@/api/client";

// logo_url from the backend is a relative API path (e.g.
// "/api/v1/companies/{id}/logo/{version}"), not an origin-inclusive URL -
// API_BASE_URL already ends in "/api/v1", so strip that back off to get just the
// origin to prefix it with. Mirrors Avatar.tsx's resolveAvatarUrl.
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export function resolveLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (/^(https?:|blob:|data:)/.test(logoUrl)) return logoUrl;
  return `${API_ORIGIN}${logoUrl}`;
}

const SIZE_CLASSES: Record<"md" | "lg", string> = {
  md: "h-14 w-14 text-xl",
  lg: "h-24 w-24 text-3xl",
};

const ICON_SIZE_CLASSES: Record<"md" | "lg", string> = {
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

interface CompanyLogoProps {
  logoUrl?: string | null;
  companyName: string;
  size?: "md" | "lg";
  className?: string;
}

/** A company's logo when set, falling back to a tinted placeholder (company name's
 * first letter, or a generic building icon for an unnamed company) otherwise - the
 * single source of truth so the list card and detail header stay consistent.
 * Deliberately rounded-lg (not rounded-full like the user Avatar) since a company
 * mark reads more naturally as a tile/icon than a profile photo. */
export function CompanyLogo({ logoUrl, companyName, size = "md", className = "" }: CompanyLogoProps) {
  const resolved = resolveLogoUrl(logoUrl);
  const sizeClass = SIZE_CLASSES[size];

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={companyName}
        className={`shrink-0 rounded-lg object-cover ${sizeClass} ${className}`}
      />
    );
  }

  const initial = companyName.trim().charAt(0).toUpperCase();

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg bg-cream font-semibold text-navy ${sizeClass} ${className}`}
    >
      {initial || <Building2 className={ICON_SIZE_CLASSES[size]} aria-hidden="true" />}
    </span>
  );
}
