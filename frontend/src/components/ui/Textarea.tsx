import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function Textarea({ label, id, className = "", ...props }: TextareaProps) {
  const textareaId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={textareaId} className="text-sm font-medium text-navy">
        {label}
      </label>
      <textarea
        id={textareaId}
        className={`rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none transition-colors duration-150 focus:border-coral focus:ring-1 focus:ring-coral ${className}`}
        {...props}
      />
    </div>
  );
}
