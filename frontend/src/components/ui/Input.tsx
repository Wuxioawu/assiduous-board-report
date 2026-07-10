import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Input({ label, id, className = "", ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-navy">
        {label}
      </label>
      <input
        id={inputId}
        className={`min-h-[44px] rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors duration-150 focus:border-coral focus:ring-1 focus:ring-coral ${className}`}
        {...props}
      />
    </div>
  );
}
