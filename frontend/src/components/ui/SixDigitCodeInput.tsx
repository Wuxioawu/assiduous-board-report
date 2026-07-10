import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

interface SixDigitCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
}

/** Six individual digit boxes for a TOTP/verification code, shared by the 2FA setup
 * flow and the login-time 2FA prompt. Fully controlled (value/onChange) so the parent
 * owns the code string exactly like a single text input would - the per-box splitting
 * is purely a display/interaction concern local to this component. */
export function SixDigitCodeInput({
  value,
  onChange,
  error = false,
  disabled = false,
  autoFocus = false,
  ariaLabel = "Verification code",
}: SixDigitCodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) inputRefs.current[0]?.focus();
  }, [autoFocus]);

  // Refocus the first box whenever an error appears - parents typically clear the value
  // on a failed attempt, so this lands the cursor ready for a fresh retype.
  useEffect(() => {
    if (error) inputRefs.current[0]?.focus();
  }, [error]);

  function distribute(rawDigits: string, startIndex: number) {
    const cleaned = rawDigits.replace(/\D/g, "").slice(0, LENGTH - startIndex);
    if (!cleaned) return;
    const next = digits.slice();
    for (let i = 0; i < cleaned.length; i++) {
      next[startIndex + i] = cleaned[i];
    }
    onChange(next.join("").slice(0, LENGTH));
    const nextFocusIndex = Math.min(startIndex + cleaned.length, LENGTH - 1);
    inputRefs.current[nextFocusIndex]?.focus();
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (cleaned.length > 1) {
      // Some mobile keyboards/autofill (e.g. SMS one-time-code) insert the whole code
      // into a single box's onChange rather than firing a paste event.
      distribute(cleaned, index);
      return;
    }
    const next = digits.slice();
    next[index] = cleaned;
    onChange(next.join("").slice(0, LENGTH));
    if (cleaned && index < LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    if (!/\d/.test(pasted)) return;
    event.preventDefault();
    distribute(pasted, index);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
      const next = digits.slice();
      next[index - 1] = "";
      onChange(next.join(""));
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < LENGTH - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  return (
    <div role="group" aria-label={ariaLabel} className="flex justify-center gap-2 sm:justify-start">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          className={`h-14 w-12 rounded-lg border bg-white text-center text-2xl font-semibold text-navy outline-none transition-colors focus:ring-1 disabled:opacity-50 ${
            error
              ? "border-destructive focus:border-destructive focus:ring-destructive"
              : "border-surface-border focus:border-coral focus:ring-coral"
          }`}
        />
      ))}
    </div>
  );
}
