const TOKEN_KEY = "assiduous_auth_token";

// Session-scoped: survives a page refresh within the tab, clears on tab
// close, and avoids the longer-lived exposure window of localStorage.
export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}
