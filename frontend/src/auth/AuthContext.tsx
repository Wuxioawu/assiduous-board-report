import { createContext, useCallback, useMemo, useState, type ReactNode } from "react";

import * as authApi from "@/api/auth";
import { setAuthToken } from "@/api/client";
import type { LoginPayload, RegisterPayload, User } from "@/types/auth";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // JWT lives only in memory (component state) - never localStorage/sessionStorage,
  // so a page refresh requires signing in again. See CLAUDE.md "开发约定".
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const login = useCallback(async (payload: LoginPayload) => {
    const response = await authApi.login(payload);
    setAuthToken(response.token.access_token);
    setToken(response.token.access_token);
    setUser(response.user);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const response = await authApi.register(payload);
    setAuthToken(response.token.access_token);
    setToken(response.token.access_token);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, isAuthenticated: token !== null, login, register, logout }),
    [user, token, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
