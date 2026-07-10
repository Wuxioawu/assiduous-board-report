import { useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { Audience } from "@/types/insight";

const TABS: { value: Audience; label: string }[] = [
  { value: "management", label: "Management" },
  { value: "board", label: "Board" },
  { value: "equity", label: "Equity Investors" },
  { value: "credit", label: "Credit Providers" },
];

export function AudienceSwitcher({ activeAudience }: { activeAudience: Audience }) {
  const { companyId } = useParams<{ companyId: string }>();
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Map<Audience, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Measures the active tab's position so the underline can slide smoothly between
  // tabs (via the transition-all below) instead of jumping instantly.
  useLayoutEffect(() => {
    function measure() {
      const activeEl = tabRefs.current.get(activeAudience);
      const navEl = navRef.current;
      if (!activeEl || !navEl) return;
      const navRect = navEl.getBoundingClientRect();
      const tabRect = activeEl.getBoundingClientRect();
      setIndicator({ left: tabRect.left - navRect.left, width: tabRect.width });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeAudience, companyId]);

  if (!companyId) return null;

  return (
    <div className="relative mb-8 border-b border-surface-border">
      <nav ref={navRef} className="relative flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = tab.value === activeAudience;
          return (
            <Link
              key={tab.value}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.value, el);
                else tabRefs.current.delete(tab.value);
              }}
              to={`/companies/${companyId}/report?audience=${tab.value}`}
              className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                isActive ? "text-coral" : "text-muted transition-colors hover:text-navy"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        {indicator && (
          <span
            className="absolute bottom-0 h-0.5 rounded-full bg-coral transition-all duration-300 ease-out"
            style={{ left: indicator.left, width: indicator.width }}
            aria-hidden="true"
          />
        )}
      </nav>
      {/* Hints that the tab bar scrolls horizontally on narrow screens where all
          four labels don't fit; irrelevant (and hidden) once they do. */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-[calc(100%-2px)] w-8 bg-gradient-to-l from-[var(--page-plane)] to-transparent sm:hidden"
        aria-hidden="true"
      />
    </div>
  );
}
