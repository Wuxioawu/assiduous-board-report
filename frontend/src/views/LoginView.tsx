import { ShieldCheck, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { getErrorDetail } from "@/api/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SixDigitCodeInput } from "@/components/ui/SixDigitCodeInput";
import { useAuth } from "@/hooks/useAuth";

export function LoginView() {
  const { login, completeTwoFactorLogin, authMessage, clearAuthMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redirectMessage, setRedirectMessage] = useState<string | null>(
    (location.state as { message?: string } | null)?.message ?? null,
  );

  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    clearAuthMessage();
    setIsSubmitting(true);
    try {
      const result = await login({ email, password });
      if ("requires_2fa" in result) {
        setPendingToken(result.pending_token);
      } else {
        navigate("/companies");
      }
    } catch {
      setError("Incorrect email or password, please try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetToCredentials() {
    setPendingToken(null);
    setTotpCode("");
    setBackupCode("");
    setUseBackupCode(false);
    setError(null);
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (!pendingToken) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await completeTwoFactorLogin({
        pending_token: pendingToken,
        ...(useBackupCode ? { backup_code: backupCode } : { totp_code: totpCode }),
      });
      navigate("/companies");
    } catch (err) {
      setError(getErrorDetail(err, "Invalid verification code."));
      if (!useBackupCode) setTotpCode("");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (pendingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--page-plane)] px-4">
        <div className="relative w-full max-w-sm rounded-xl border border-surface-border bg-white p-10 shadow-card">
          <button
            type="button"
            onClick={resetToCredentials}
            aria-label="Back to login"
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted transition-colors hover:bg-cream hover:text-navy"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="mb-5 flex justify-center">
            <ShieldCheck className="h-14 w-14 text-coral" aria-hidden="true" />
          </div>

          <h1 className="mb-2 text-center text-xl font-bold text-navy">
            Two-Factor Verification
          </h1>
          <p className="mb-8 text-center text-sm leading-relaxed text-muted">
            {useBackupCode
              ? "Enter one of your backup codes."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
          <form onSubmit={handleVerify} className="flex flex-col gap-5">
            {useBackupCode ? (
              <Input
                label="Backup Code"
                name="backupCode"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                autoFocus
                required
              />
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-navy">Authentication Code</label>
                <SixDigitCodeInput
                  value={totpCode}
                  onChange={setTotpCode}
                  error={!!error}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              disabled={isSubmitting || (!useBackupCode && totpCode.length !== 6)}
              className="mt-2 w-full"
            >
              {isSubmitting ? "Verifying…" : "Verify"}
            </Button>
          </form>
          <div className="mt-6 flex flex-col items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => {
                setUseBackupCode((v) => !v);
                setError(null);
              }}
              className="font-medium text-coral transition-colors hover:underline"
            >
              {useBackupCode ? "Use an authenticator code instead" : "Use a backup code instead"}
            </button>
            <button
              type="button"
              onClick={resetToCredentials}
              className="text-muted transition-colors hover:underline"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-plane)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-white p-8 shadow-card">
        <h1 className="mb-1 text-xl font-bold text-navy">Log In</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          Assiduous Board Report Platform
        </p>
        {authMessage && (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {authMessage}
          </p>
        )}
        {redirectMessage && (
          <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {redirectMessage}
          </p>
        )}
        <form
          onSubmit={handleSubmit}
          onFocus={() => {
            clearAuthMessage();
            setRedirectMessage(null);
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="Email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="text-right text-sm">
            <Link to="/forgot-password" className="font-medium text-coral transition-colors hover:underline">
              Forgot password?
            </Link>
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? "Logging in…" : "Log In"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-coral transition-colors hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
