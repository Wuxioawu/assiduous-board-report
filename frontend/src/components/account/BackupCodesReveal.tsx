import { Check, CheckCircle2, Copy, Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface BackupCodesRevealProps {
  codes: string[];
  onDone: () => void;
  /** "setup" (default) shows the "2FA is now enabled" success banner - not accurate
   * when this same reveal is reused for regenerating codes on an account where 2FA was
   * already enabled, so that call site passes "regenerate" instead. */
  mode?: "setup" | "regenerate";
  /** When true, renders without its own Card - for use inside a section that's
   * already inside one (e.g. the integrated Two-Factor Authentication page). */
  embedded?: boolean;
}

export function BackupCodesReveal({ codes, onDone, mode = "setup", embedded = false }: BackupCodesRevealProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([codes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "assiduous-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  const content = (
    <>
      {mode === "setup" && (
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-[var(--status-good)]" aria-hidden="true" />
          <p className="text-sm font-semibold text-navy">
            Two-factor authentication is now enabled for your account.
          </p>
        </div>
      )}
      <p className="mb-4 text-sm leading-relaxed text-muted">
        These backup codes let you sign in if you ever lose access to your authenticator app. Each code
        works only once, and they won't be shown again after you leave this page - store them somewhere
        secure, like a password manager.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-surface-border bg-cream p-4 font-mono text-sm text-navy">
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" onClick={handleCopy} className="flex items-center justify-center gap-1.5">
          {copied ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
          {copied ? "Copied" : "Copy to clipboard"}
        </Button>
        <Button onClick={handleDownload} className="flex items-center justify-center gap-1.5">
          <Download className="h-5 w-5" aria-hidden="true" />
          Download as text file
        </Button>
      </div>
      <Button onClick={onDone} className="w-full">
        I've saved these codes
      </Button>
    </>
  );

  if (embedded) return <div>{content}</div>;
  return <Card>{content}</Card>;
}
