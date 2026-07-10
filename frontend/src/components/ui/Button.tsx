import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-coral text-white hover:bg-coral-hover disabled:bg-coral/40",
  secondary: "bg-white text-navy border border-navy hover:bg-cream disabled:opacity-50",
  // Outline-only (not a solid fill) so a destructive action never visually competes
  // with the primary coral CTA - it should read as "careful", not "the main button".
  danger: "bg-white text-destructive border border-destructive hover:bg-destructive/5 disabled:opacity-50",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
