import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/companies" className="text-lg font-semibold text-slate-900 dark:text-white">
            Assiduous Board Report
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
            {user && (
              <span>
                {user.full_name} · {user.role}
              </span>
            )}
            <Button variant="secondary" onClick={logout}>
              退出登录
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
