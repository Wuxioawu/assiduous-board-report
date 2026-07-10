import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Rendered below the scrollable body, pinned to the bottom of the modal -
   * for action buttons (Save/Cancel, Confirm/Cancel) that should stay
   * reachable without scrolling on modals whose body can grow tall (e.g. a
   * long form or an unbounded list). Modals with short, bounded content can
   * omit this and just include their buttons in `children` as before. */
  footer?: ReactNode;
}

// Mirrors AccountPanel's focus-trap implementation so every overlay in the app
// (confirmation dialogs, edit forms) behaves the same way for keyboard/screen
// reader users, rather than each having its own accessibility story.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, children, onClose, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // Focus the first real control (e.g. Cancel) when present, since that's
    // almost always a safe, non-destructive default across this app's modals -
    // falls back to the panel itself for content with no focusable children.
    const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? panel).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-overlay-in"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // max-h-[90vh] + flex flex-col: the panel itself never exceeds the
        // viewport (so the browser's own chrome can never clip it, and it's
        // always fully reachable), while the body section below scrolls
        // internally instead of the whole panel growing taller than the
        // screen (see CompanyDetailView's Edit Company modal, which motivated
        // this - logo upload + every profile field could overflow a laptop
        // viewport with no way to reach Save).
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-surface-border bg-white shadow-lg outline-none animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="shrink-0 border-b border-surface-border px-6 pb-4 pt-6 text-lg font-semibold text-navy">
          {title}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-surface-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
