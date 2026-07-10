import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  /** Adds a hover lift (shadow increase) for cards that are themselves clickable -
   * omit for static content containers (forms, panels) where hovering means nothing. */
  interactive?: boolean;
}

export function Card({ title, children, className = "", interactive = false }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-surface-border bg-white p-6 shadow-card transition-shadow duration-200 ${interactive ? "hover:shadow-card-hover" : ""} ${className}`}
    >
      {title && <h3 className="mb-4 text-base font-semibold text-navy">{title}</h3>}
      {children}
    </div>
  );
}
