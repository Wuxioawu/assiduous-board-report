import axios from "axios";

export function getErrorDetail(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return fallback;
}

export type FieldErrors = Record<string, string>;

/** Pulls per-field messages out of a FastAPI/Pydantic 422 response, e.g.
 * {"detail": [{"loc": ["body", "website_url"], "msg": "...", "type": "..."}]}
 * -> {website_url: "..."} - keyed by the field's own name (the last element
 * of `loc`), so callers can look a message up by the same name the API
 * schema uses and show it next to the offending input instead of only a
 * generic "failed" message. Returns null for anything that isn't a
 * field-shaped 422 body (network errors, 500s, a plain string detail),
 * so callers can fall back to getErrorDetail for those. */
export function getFieldErrors(error: unknown): FieldErrors | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 422) return null;
  const detail: unknown = error.response.data?.detail;
  if (!Array.isArray(detail)) return null;

  const fieldErrors: FieldErrors = {};
  for (const item of detail) {
    const loc = item?.loc;
    const msg = item?.msg;
    const field = Array.isArray(loc) ? loc[loc.length - 1] : undefined;
    if (typeof field === "string" && typeof msg === "string") {
      fieldErrors[field] = msg;
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

export type ErrorKind = "network" | "not-found" | "unauthorized" | "unknown";

/** Buckets a caught error into a small set of user-meaningful categories, so
 * callers can show a message (and decide whether "Retry" makes sense) that
 * matches what actually happened instead of one generic "failed to load"
 * string for every case - a network hiccup, a genuinely missing resource, and
 * a permissions problem all call for different copy. */
export function classifyError(error: unknown): ErrorKind {
  if (!axios.isAxiosError(error)) return "unknown";
  if (!error.response) return "network";
  if (error.response.status === 401 || error.response.status === 403) return "unauthorized";
  if (error.response.status === 404) return "not-found";
  return "unknown";
}
