import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      {title && (
        <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</h3>
      )}
      {children}
    </div>
  );
}
