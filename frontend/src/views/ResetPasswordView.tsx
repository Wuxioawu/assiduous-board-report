import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import * as authApi from "@/api/auth";
import { getErrorDetail } from "@/api/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function ResetPasswordView() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmNewPassword) {
      setError("New Password and Confirm New Password do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.resetPassword({ token, new_password: newPassword });
      navigate("/login", { state: { message: "Password reset successfully, please log in." } });
    } catch (err) {
      setError(
        getErrorDetail(err, "This reset link is invalid or has expired. Please request a new one."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-plane)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-white p-8 shadow-card">
        <h1 className="mb-1 text-xl font-bold text-navy">Reset Password</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">Choose a new password.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="New Password"
            type="password"
            name="newPassword"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <Input
            label="Confirm New Password"
            type="password"
            name="confirmNewPassword"
            minLength={8}
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            required
          />
          {error && (
            <p className="text-sm text-destructive">
              {error}{" "}
              <Link to="/forgot-password" className="font-medium text-coral transition-colors hover:underline">
                Request a new link
              </Link>
            </p>
          )}
          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? "Resetting…" : "Reset Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
