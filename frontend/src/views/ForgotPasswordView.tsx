import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import * as authApi from "@/api/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await authApi.forgotPassword({ email });
      setMessage(response.message);
    } catch {
      // The backend always returns the same generic success message for this
      // endpoint, so a request failure here is a network/server issue - show
      // the same generic copy rather than leaking whether the email exists.
      setMessage("If an account with that email exists, a reset link has been sent.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-plane)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-white p-8 shadow-card">
        <h1 className="mb-1 text-xl font-bold text-navy">Forgot Password</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          Enter your email and we'll send you a reset link.
        </p>
        {message ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? "Sending…" : "Send Reset Link"}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted">
          <Link to="/login" className="font-medium text-coral transition-colors hover:underline">
            Back to Log In
          </Link>
        </p>
      </div>
    </div>
  );
}
