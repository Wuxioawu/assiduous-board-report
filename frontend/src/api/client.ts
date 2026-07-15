import axios, { type InternalAxiosRequestConfig } from "axios";

import { triggerUnauthorized } from "@/auth/authEvents";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

// >1s round-trip is slow enough to be worth flagging in the console, tagged
// with the backend's X-Request-ID (see app/core/request_timing.py) so a slow
// screen can be matched to its exact backend log line without guessing.
const SLOW_REQUEST_MS = 1000;

const SLOW_REQUEST_START = Symbol("slowRequestStart");

type TimedRequestConfig = InternalAxiosRequestConfig & { [SLOW_REQUEST_START]?: number };

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

apiClient.interceptors.request.use((config: TimedRequestConfig) => {
  config[SLOW_REQUEST_START] = performance.now();
  return config;
});

function requestSummary(config?: TimedRequestConfig): string {
  return `${config?.method?.toUpperCase() ?? "?"} ${config?.url ?? "?"}`;
}

apiClient.interceptors.response.use(
  (response) => {
    const config = response.config as TimedRequestConfig;
    const startedAt = config[SLOW_REQUEST_START];
    const elapsedMs = startedAt !== undefined ? performance.now() - startedAt : undefined;
    if (elapsedMs !== undefined && elapsedMs > SLOW_REQUEST_MS) {
      const requestId = response.headers?.["x-request-id"] ?? "unknown";
      console.warn(
        `[slow-request] ${requestSummary(config)} took ${elapsedMs.toFixed(0)}ms (req_id=${requestId})`,
      );
    }
    return response;
  },
  (error) => {
    // A 401 only means "your session expired" for requests that were sent
    // with a bearer token to begin with. Unauthenticated requests (login,
    // 2FA verification, register, etc.) also return 401 on bad credentials -
    // that's a normal rejection of the current attempt, not a session event,
    // and must not trigger the same "please log in again" banner.
    const hadAuthHeader = Boolean(error.config?.headers?.Authorization);
    if (axios.isAxiosError(error) && error.response?.status === 401 && hadAuthHeader) {
      triggerUnauthorized();
    }

    if (axios.isAxiosError(error)) {
      const config = error.config as TimedRequestConfig | undefined;
      const startedAt = config?.[SLOW_REQUEST_START];
      const elapsedMs = startedAt !== undefined ? performance.now() - startedAt : undefined;
      const requestId = error.response?.headers?.["x-request-id"] ?? "unknown";
      const elapsedLabel = elapsedMs !== undefined ? `${elapsedMs.toFixed(0)}ms` : "unknown duration";
      console.warn(
        `[request-error] ${requestSummary(config)} failed after ${elapsedLabel} ` +
          `(status=${error.response?.status ?? "network error"}, req_id=${requestId})`,
      );
    }

    return Promise.reject(error);
  },
);
