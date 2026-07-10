import type { ReactNode } from "react";

interface CollapsibleSectionProps {
  open: boolean;
  children: ReactNode;
}

/** Smoothly expands/collapses to the content's natural height via the CSS
 * grid-template-rows 0fr/1fr trick - a plain height transition can't animate
 * to/from "auto", and this avoids measuring the DOM in JS to fake it. */
export function CollapsibleSection({ open, children }: CollapsibleSectionProps) {
  return (
    <div
      className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="min-h-0">{children}</div>
    </div>
  );
}
