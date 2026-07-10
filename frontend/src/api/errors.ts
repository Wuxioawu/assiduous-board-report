import axios from "axios";

export function getErrorDetail(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return fallback;
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
