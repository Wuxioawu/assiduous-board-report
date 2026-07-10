import { API_BASE_URL } from "@/api/client";
import { getInitials } from "@/lib/initials";

// avatar_url from the backend is a relative API path (e.g. "/api/v1/users/{id}/avatar"),
// not an origin-inclusive URL - API_BASE_URL already ends in "/api/v1", so strip that
// back off to get just the origin to prefix it with.
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  // A local object-URL preview (shown mid-upload, before the server has a URL to
  // return) is already a complete URL and must not be prefixed with the API origin.
  if (/^(https?:|blob:|data:)/.test(avatarUrl)) return avatarUrl;
  return `${API_ORIGIN}${avatarUrl}`;
}

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

interface AvatarProps {
  avatarUrl?: string | null;
  fullName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** A user's profile photo when set, falling back to initials-on-navy otherwise -
 * the single source of truth for this fallback so every place a user's identity
 * appears (header trigger, Account panel, Team member list) stays consistent. */
export function Avatar({ avatarUrl, fullName, size = "md", className = "" }: AvatarProps) {
  const resolved = resolveAvatarUrl(avatarUrl);
  const sizeClass = SIZE_CLASSES[size];

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={fullName}
        className={`shrink-0 rounded-full object-cover ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-navy font-semibold text-white ${sizeClass} ${className}`}
    >
      {getInitials(fullName)}
    </span>
  );
}
