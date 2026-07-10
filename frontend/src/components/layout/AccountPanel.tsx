import { Building2, KeyRound, LogOut, Shield, ShieldCheck, Users } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { AvatarUploader } from "@/components/account/AvatarUploader";
import { useAuth } from "@/hooks/useAuth";
import { canManageOrg } from "@/lib/roles";

interface AccountPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M5 5l10 10M15 5 5 15"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountPanel({ isOpen, onClose }: AccountPanelProps) {
  const { user, logout } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!user) return null;

  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${ isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0" }`}
      aria-hidden={!isOpen}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-panel-heading"
        className={`absolute right-0 top-0 flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-surface-border bg-white shadow-2xl transition-transform duration-300 ease-in-out ${ isOpen ? "translate-x-0" : "translate-x-full" }`}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h2 id="account-panel-heading" className="text-base font-semibold text-navy">
            Account
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close account panel"
            className="rounded-full p-1.5 text-muted transition-colors hover:bg-cream hover:text-navy"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-1 flex-col px-5 py-5">
          <div className="flex items-start gap-3">
            <AvatarUploader user={user} />
            <div className="min-w-0 pt-0.5">
              <p className="truncate text-lg font-semibold text-navy">{user.full_name}</p>
              <p className="truncate text-sm text-muted">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                  <Shield className="h-4 w-4" aria-hidden="true" />
                  {roleLabel}
                </span>
                {user.organization_name && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                    {user.organization_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <hr className="my-5 border-surface-border" />

          {canManageOrg(user.role) && (
            <Link
              to="/team"
              onClick={onClose}
              className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-navy transition-colors hover:bg-cream"
            >
              <Users className="h-4 w-4 text-muted" aria-hidden="true" />
              Manage Team
            </Link>
          )}

          <Link
            to="/two-factor"
            onClick={onClose}
            className="mb-2 flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-navy transition-colors hover:bg-cream"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted" aria-hidden="true" />
              Two-Factor Authentication
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${ user.totp_enabled ? "bg-emerald-50 text-emerald-700 " : "bg-cream text-muted " }`}
            >
              {user.totp_enabled ? "On" : "Off"}
            </span>
          </Link>

          <Link
            to="/change-password"
            onClick={onClose}
            className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-navy transition-colors hover:bg-cream"
          >
            <KeyRound className="h-4 w-4 text-muted" aria-hidden="true" />
            Change Password
          </Link>

          <div className="mt-auto pt-5">
            <hr className="mb-4 border-surface-border" />
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-destructive/5 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
