// Bridges the axios response interceptor (plain module, no React context)
// to AuthProvider (which owns the actual auth state). AuthProvider registers
// its handler on mount; the interceptor calls it whenever a request comes
// back 401 so the whole app reacts consistently to an expired/invalid token.
type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

export function registerUnauthorizedHandler(fn: UnauthorizedHandler) {
  handler = fn;
}

export function triggerUnauthorized() {
  handler?.();
}
