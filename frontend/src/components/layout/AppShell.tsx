import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

const HOME_PATH = "/companies";

// Routes whose "back" should go to a fixed, predictable parent rather than
// relying on browser history (e.g. a report page reached via a shared link
// has no in-app history to go back to).
const EXPLICIT_BACK_TARGETS: { pattern: RegExp; target: string }[] = [
  { pattern: /^\/companies\/[^/]+\/documents\/?$/, target: HOME_PATH },
  { pattern: /^\/companies\/[^/]+\/report\/?$/, target: HOME_PATH },
];

// The company list IS the home page, and the auth pages have no "back" - no
// button on either.
const NO_BACK_PATHS = new Set([HOME_PATH, "/login", "/register"]);

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12.5 15.5 6.5 10l6-5.5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const showBack = !NO_BACK_PATHS.has(location.pathname);
  const explicitTarget = EXPLICIT_BACK_TARGETS.find((entry) => entry.pattern.test(location.pathname))?.target;

  function handleBack() {
    if (explicitTarget) {
      navigate(explicitTarget);
    } else {
      navigate(-1);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to={HOME_PATH} className="text-lg font-semibold text-slate-900 dark:text-white">
              Assiduous Board Report
            </Link>
            {showBack && (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Back"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <BackIcon />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
            {user && (
              <span>
                {user.full_name} · {user.role}
              </span>
            )}
            <Button variant="secondary" onClick={logout}>
              Log Out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
