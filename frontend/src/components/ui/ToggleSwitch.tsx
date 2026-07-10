import { Spinner } from "@/components/ui/Spinner";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel: string;
}

/** Standard on/off switch (role="switch") - checked reflects "enabled or actively
 * moving toward enabled", not necessarily the persisted server state, so callers
 * can keep it lit up through an in-progress setup/disable flow. */
export function ToggleSwitch({ checked, onChange, disabled = false, loading = false, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled || loading}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-coral" : "border border-surface-border bg-cream"
      }`}
    >
      {loading ? (
        <span className="mx-auto flex h-4 w-4 items-center justify-center">
          <Spinner className="h-3.5 w-3.5 text-white" />
        </span>
      ) : (
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      )}
    </button>
  );
}
