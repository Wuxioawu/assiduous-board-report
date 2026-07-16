import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Field-level validation message (e.g. from a 422 response) - shown below
   * the input instead of only surfacing as a generic form-wide error. */
  error?: string;
}

export function Input({ label, id, className = "", error, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-navy">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={!!error}
        className={`min-h-[44px] rounded-lg border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors duration-150 focus:ring-1 ${
          error
            ? "border-destructive focus:border-destructive focus:ring-destructive"
            : "border-surface-border focus:border-coral focus:ring-coral"
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
