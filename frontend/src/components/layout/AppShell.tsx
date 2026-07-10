import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import assiduousLogo from "@/assets/assiduous_logo.png";
import { AccountPanel } from "@/components/layout/AccountPanel";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";

const HOME_PATH = "/companies";

// Routes whose "back" should go to a fixed, predictable parent rather than
// relying on browser history (e.g. a report page reached via a shared link
// has no in-app history to go back to). Patterns capture the companyId since
// most of these need a dynamic target (the company's own detail page), not a
// fixed one.
const EXPLICIT_BACK_TARGETS: { pattern: RegExp; target: (companyId: string) => string }[] = [
  {
    pattern: /^\/companies\/([^/]+)\/documents\/(?:ingestion|financial-data)\/?$/,
    target: (companyId) => `/companies/${companyId}/documents`,
  },
  { pattern: /^\/companies\/([^/]+)\/documents\/?$/, target: (companyId) => `/companies/${companyId}` },
  { pattern: /^\/companies\/([^/]+)\/report\/?$/, target: (companyId) => `/companies/${companyId}` },
  { pattern: /^\/companies\/([^/]+)\/budget\/?$/, target: (companyId) => `/companies/${companyId}` },
  { pattern: /^\/companies\/([^/]+)\/benchmarks\/?$/, target: (companyId) => `/companies/${companyId}` },
];

// The company list IS the home page, and the auth pages have no "back" - no
// button on either.
const NO_BACK_PATHS = new Set([
  HOME_PATH,
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d="M5.5 7.5 10 12l4.5-4.5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Official logo asset (src/assets/assiduous_logo.png) rather than a recreated
// SVG/text approximation, so the mark and wordmark always match the brand exactly.
function AssiduousLogo() {
  return <img src={assiduousLogo} alt="Assiduous" className="h-9 w-auto shrink-0" />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAccountPanelOpen, setIsAccountPanelOpen] = useState(false);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const wasAccountPanelOpen = useRef(false);

  const showBack = !NO_BACK_PATHS.has(location.pathname);
  const explicitMatch = EXPLICIT_BACK_TARGETS.map((entry) => ({
    entry,
    match: location.pathname.match(entry.pattern),
  })).find(({ match }) => match !== null);

  function handleBack() {
    if (explicitMatch) {
      navigate(explicitMatch.entry.target(explicitMatch.match![1]));
    } else {
      navigate(-1);
    }
  }

  // Return focus to the trigger button once the panel finishes closing,
  // regardless of how it was closed (overlay click, Escape, or the X button).
  useEffect(() => {
    if (wasAccountPanelOpen.current && !isAccountPanelOpen) {
      accountTriggerRef.current?.focus();
    }
    wasAccountPanelOpen.current = isAccountPanelOpen;
  }, [isAccountPanelOpen]);

  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <header className="border-b border-surface-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link to={HOME_PATH} className="shrink-0">
              <AssiduousLogo />
            </Link>
            {showBack && (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Back"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-surface-border px-2.5 py-1.5 text-sm font-medium text-navy transition-colors hover:bg-cream sm:px-3"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}
          </div>
          {user && (
            <button
              ref={accountTriggerRef}
              type="button"
              onClick={() => setIsAccountPanelOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={isAccountPanelOpen}
              className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-navy transition-colors hover:bg-cream sm:pr-3"
            >
              <Avatar avatarUrl={user.avatar_url} fullName={user.full_name} size="sm" />
              <span className="hidden sm:inline">{user.full_name.split(" ")[0]}</span>
              <ChevronDownIcon />
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <AccountPanel isOpen={isAccountPanelOpen} onClose={() => setIsAccountPanelOpen(false)} />
    </div>
  );
}
