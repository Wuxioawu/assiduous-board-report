import axios from "axios";

import { triggerUnauthorized } from "@/auth/authEvents";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

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

apiClient.interceptors.response.use(
  (response) => response,
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
    return Promise.reject(error);
  },
);
