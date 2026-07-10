import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const AUTO_DISMISS_MS = 4000;

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-surface-border text-navy",
  error: "border-destructive/30 text-navy",
  info: "border-amber-200 text-navy",
};

const VARIANT_ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--status-good)]" aria-hidden="true" />,
  error: <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />,
  info: <Info className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Fixed bottom-right stack, matches the app's card/shadow visual language
       * rather than introducing a new floating-element style. role="status" +
       * aria-live so screen readers announce confirmations the same way sighted
       * users see them, unlike the rest of the app's silent state updates. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border bg-white p-3.5 shadow-card-hover animate-toast-in ${VARIANT_STYLES[toast.variant]}`}
          >
            {VARIANT_ICONS[toast.variant]}
            <p className="flex-1 text-sm leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="shrink-0 text-muted transition-colors hover:text-navy"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
