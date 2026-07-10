import { useState, type FormEvent } from "react";

import * as authApi from "@/api/auth";
import { getErrorDetail } from "@/api/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ChangePasswordFormProps {
  /** Called right after a successful update (fields already cleared, success
   * message already set) - lets the page-level view react, e.g. by revealing a
   * "Back to Account" button, without this component knowing about navigation. */
  onSuccess?: () => void;
}

export function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps = {}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmNewPassword) {
      setError("New Password and Confirm New Password do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      const { message } = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccess(message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      onSuccess?.();
    } catch (err) {
      setError(getErrorDetail(err, "Failed to update password, please try again"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      {success && (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Current Password"
          type="password"
          name="currentPassword"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
          {isSubmitting ? "Updating…" : "Update Password"}
        </Button>
      </form>
    </div>
  );
}
