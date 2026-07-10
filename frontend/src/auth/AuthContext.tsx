import axios from "axios";
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import * as authApi from "@/api/auth";
import { setAuthToken } from "@/api/client";
import { registerUnauthorizedHandler } from "@/auth/authEvents";
import { clearStoredToken, getStoredToken, setStoredToken } from "@/auth/tokenStorage";
import type { AuthResponse, LoginPayload, LoginResult, RegisterPayload, User } from "@/types/auth";
import type {
  AcceptInvitationBlockedResponse,
  AcceptInvitationPayload,
  AcceptInvitationWithDeletionPayload,
} from "@/types/team";
import { isAcceptInvitationBlocked } from "@/types/team";
import type { LoginVerifyPayload } from "@/types/twoFactor";

const SESSION_EXPIRED_MESSAGE = "Your session has expired for security. Please log in again below.";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  authMessage: string | null;
  clearAuthMessage: () => void;
  login: (payload: LoginPayload) => Promise<LoginResult>;
  completeTwoFactorLogin: (payload: LoginVerifyPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  acceptInvitation: (
    payload: AcceptInvitationPayload,
  ) => Promise<AcceptInvitationBlockedResponse | null>;
  acceptInvitationWithDeletion: (payload: AcceptInvitationWithDeletionPayload) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
  // Distinct from logout(): used when the caller's OWN role changed mid-session.
  // The JWT's role claim is only set at login and never revoked, so an already-issued
  // token keeps granting the OLD permissions until a fresh one is issued - this clears
  // the stale session and surfaces a message explaining why, instead of leaving the
  // user to hit confusing 403s until they happen to log out and back in themselves.
  forceReauth: (message: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // The JWT is persisted to sessionStorage (tab-scoped, cleared on tab close)
  // so a page refresh doesn't silently log the user out, while avoiding the
  // longer-lived exposure window of localStorage.
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const clearAuthMessage = useCallback(() => setAuthMessage(null), []);

  const logout = useCallback(() => {
    setAuthToken(null);
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  const forceReauth = useCallback((message: string) => {
    setAuthToken(null);
    clearStoredToken();
    setToken(null);
    setUser(null);
    setAuthMessage(message);
  }, []);

  // Restore the session on load: if a token is in sessionStorage, validate it
  // against the backend before trusting it (it may have expired since the tab
  // was last open).
  useEffect(() => {
    const stored = getStoredToken();
    if (!stored) {
      setIsInitializing(false);
      return;
    }
    setAuthToken(stored);
    authApi
      .me()
      .then((fetchedUser) => {
        setToken(stored);
        setUser(fetchedUser);
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          clearStoredToken();
          setAuthToken(null);
        }
      })
      .finally(() => setIsInitializing(false));
  }, []);

  // Bridge for the axios 401 interceptor (see api/client.ts) - any expired or
  // invalid token, from any request, forces a clean logout with an
  // explanatory message instead of a silent "failed to load".
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setAuthToken(null);
      clearStoredToken();
      setToken(null);
      setUser(null);
      setAuthMessage(SESSION_EXPIRED_MESSAGE);
    });
  }, []);

  const applyAuthResponse = useCallback((response: AuthResponse) => {
    setAuthToken(response.token.access_token);
    setStoredToken(response.token.access_token);
    setToken(response.token.access_token);
    setUser(response.user);
    setAuthMessage(null);
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const result = await authApi.login(payload);
      if ("requires_2fa" in result) {
        return result;
      }
      applyAuthResponse(result);
      return result;
    },
    [applyAuthResponse],
  );

  const completeTwoFactorLogin = useCallback(
    async (payload: LoginVerifyPayload) => {
      const response = await authApi.verifyTwoFactorLogin(payload);
      applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const response = await authApi.register(payload);
      applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const acceptInvitation = useCallback(
    async (payload: AcceptInvitationPayload) => {
      const response = await authApi.acceptInvitation(payload);
      if (isAcceptInvitationBlocked(response)) {
        return response;
      }
      applyAuthResponse(response);
      return null;
    },
    [applyAuthResponse],
  );

  const acceptInvitationWithDeletion = useCallback(
    async (payload: AcceptInvitationWithDeletionPayload) => {
      const response = await authApi.acceptInvitationWithDeletion(payload);
      applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const refreshUser = useCallback(async () => {
    const fetchedUser = await authApi.me();
    setUser(fetchedUser);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: token !== null,
      isInitializing,
      authMessage,
      clearAuthMessage,
      login,
      completeTwoFactorLogin,
      register,
      acceptInvitation,
      acceptInvitationWithDeletion,
      refreshUser,
      logout,
      forceReauth,
    }),
    [
      user,
      token,
      isInitializing,
      authMessage,
      clearAuthMessage,
      login,
      completeTwoFactorLogin,
      register,
      acceptInvitation,
      acceptInvitationWithDeletion,
      refreshUser,
      logout,
      forceReauth,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
