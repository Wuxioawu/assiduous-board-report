import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { previewInvitation } from "@/api/auth";
import { getErrorDetail } from "@/api/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import type { AcceptInvitationBlockedResponse, InvitationPreview } from "@/types/team";

const INVALID_TOKEN_MESSAGE =
  "This invitation link is invalid or has expired. Please ask your organization admin for a new one.";

export function AcceptInvitationView() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const { acceptInvitation, acceptInvitationWithDeletion } = useAuth();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [soleMemberBlock, setSoleMemberBlock] = useState<AcceptInvitationBlockedResponse | null>(null);
  const [confirmOrganizationName, setConfirmOrganizationName] = useState("");

  const missingToken = token === "";

  useEffect(() => {
    if (missingToken) {
      setIsLoadingPreview(false);
      return;
    }
    previewInvitation(token)
      .then(setPreview)
      .catch((err) => setPreviewError(getErrorDetail(err, INVALID_TOKEN_MESSAGE)))
      .finally(() => setIsLoadingPreview(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const isTransfer = preview?.invitation_type === "transfer";
  const oldOrgName =
    soleMemberBlock?.current_organization_name ?? preview?.current_organization_name ?? null;
  const newOrgName = preview?.organization_name ?? "";
  const orgNameConfirmed = oldOrgName !== null && confirmOrganizationName === oldOrgName;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isTransfer && password !== confirmPassword) {
      setError("Password and Confirm Password do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      const blocked = await acceptInvitation(
        isTransfer ? { token, password } : { token, full_name: fullName, password },
      );
      if (blocked) {
        setSoleMemberBlock(blocked);
        return;
      }
      navigate("/companies");
    } catch (err) {
      setError(getErrorDetail(err, INVALID_TOKEN_MESSAGE));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteAndTransfer(event: FormEvent) {
    event.preventDefault();
    if (!oldOrgName || !orgNameConfirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await acceptInvitationWithDeletion({
        token,
        password,
        confirm_organization_name: confirmOrganizationName,
      });
      navigate("/companies");
    } catch (err) {
      setError(getErrorDetail(err, INVALID_TOKEN_MESSAGE));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-plane)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-white p-8 shadow-card">
        <h1 className="mb-1 text-xl font-bold text-navy">Accept Invitation</h1>

        {missingToken ? (
          <>
            <p className="mb-6 text-sm leading-relaxed text-muted">
              Set your name and password to finish joining your organization.
            </p>
            <p className="text-sm text-destructive">
              This invitation link is missing its token. Please use the link from your invitation email.
            </p>
          </>
        ) : isLoadingPreview ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-4 w-4" />
            Loading invitation…
          </p>
        ) : previewError ? (
          <p className="text-sm text-destructive">
            {previewError}{" "}
            <Link to="/login" className="font-medium text-coral transition-colors hover:underline">
              Go to login
            </Link>
          </p>
        ) : isTransfer ? (
          <>
            <p className="mb-4 text-sm leading-relaxed text-muted">
              You've been invited to join <strong className="text-navy">{preview!.organization_name}</strong>.
            </p>
            <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-800">
              <strong>Note:</strong> you currently have an account
              {preview!.current_organization_name ? (
                <>
                  {" "}
                  under <strong>{preview!.current_organization_name}</strong>
                </>
              ) : null}
              . Accepting this invitation will move your account to{" "}
              <strong>{preview!.organization_name}</strong>, and you will lose access to{" "}
              {preview!.current_organization_name ?? "your current organization"}. If you're the only
              member there, you'll also be asked to delete it as the last step of the move — we'll
              explain exactly what that means before anything happens. Log in below with your existing
              password to confirm.
            </p>
            <form
              onSubmit={soleMemberBlock ? handleDeleteAndTransfer : handleSubmit}
              className="flex flex-col gap-4"
            >
              <Input
                label="Password"
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />

              {soleMemberBlock && oldOrgName ? (
                <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm leading-relaxed text-navy">
                    You're the only member of <strong>{oldOrgName}</strong> — likely from an earlier
                    invitation that's no longer needed. Since no one else has access to it, finishing
                    your move to <strong>{newOrgName}</strong> means deleting it.
                  </p>
                  <p className="text-sm leading-relaxed text-destructive">
                    <strong>This can't be undone:</strong> everything in {oldOrgName} — its companies,
                    documents, financial records, and activity history — will be permanently deleted.
                  </p>
                  <Input
                    label={`Type "${oldOrgName}" to confirm`}
                    name="confirmOrganizationName"
                    value={confirmOrganizationName}
                    onChange={(e) => setConfirmOrganizationName(e.target.value)}
                    autoComplete="off"
                    required
                  />
                  <Button
                    type="submit"
                    variant="danger"
                    disabled={isSubmitting || !orgNameConfirmed || !password}
                    className="w-full"
                  >
                    {isSubmitting
                      ? "Deleting and joining…"
                      : `Delete ${oldOrgName} and Join ${newOrgName}`}
                  </Button>
                </div>
              ) : (
                <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
                  {isSubmitting ? "Confirming…" : "Log In & Transfer Account"}
                </Button>
              )}

              {error && (
                <p className="text-sm text-destructive">
                  {error}{" "}
                  <Link to="/login" className="font-medium text-coral transition-colors hover:underline">
                    Go to login
                  </Link>
                </p>
              )}
            </form>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm leading-relaxed text-muted">
              Set your name and password to finish joining{" "}
              <strong className="text-navy">{preview!.organization_name}</strong>.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                label="Full Name"
                name="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                name="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm Password"
                type="password"
                name="confirmPassword"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {error && (
                <p className="text-sm text-destructive">
                  {error}{" "}
                  <Link to="/login" className="font-medium text-coral transition-colors hover:underline">
                    Go to login
                  </Link>
                </p>
              )}
              <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
                {isSubmitting ? "Setting up account…" : "Accept & Join"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
