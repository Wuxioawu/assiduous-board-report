import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface HubTileProps {
  to: string;
  icon: ReactNode;
  title: string;
  description: string;
  summary?: string;
}

/** A navigation tile linking to a company-scoped sub-feature - originally built
 * for the Documents hub, now shared with CompanyDetailView's tile row so both
 * present destinations the same way. */
export function HubTile({ to, icon, title, description, summary }: HubTileProps) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-xl border border-surface-border bg-white p-6 shadow-card transition-shadow duration-200 hover:shadow-card-hover"
    >
      <div className="mb-4 flex items-start justify-between">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream text-navy">
          {icon}
        </span>
        <ChevronRight
          className="h-5 w-5 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-coral"
          aria-hidden="true"
        />
      </div>
      <h3 className="mb-1 text-base font-semibold text-navy">{title}</h3>
      <p className="mb-4 text-sm leading-relaxed text-muted">{description}</p>
      {summary && <p className="mt-auto text-xs font-medium text-muted">{summary}</p>}
    </Link>
  );
}
