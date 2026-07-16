import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  /** Field-level validation message (e.g. from a 422 response) - shown below
   * the textarea instead of only surfacing as a generic form-wide error. */
  error?: string;
}

export function Textarea({ label, id, className = "", error, ...props }: TextareaProps) {
  const textareaId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={textareaId} className="text-sm font-medium text-navy">
        {label}
      </label>
      <textarea
        id={textareaId}
        aria-invalid={!!error}
        className={`rounded-lg border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors duration-150 focus:ring-1 ${
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
