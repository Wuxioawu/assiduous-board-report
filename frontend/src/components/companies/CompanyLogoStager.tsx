import { Camera } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { CompanyLogo } from "@/components/ui/CompanyLogo";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface CompanyLogoStagerProps {
  companyName: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
}

/** Logo picker for the company-creation flow, where there's no company id yet to
 * upload against. Design choice (see CreateCompanyView): stage the file client-side
 * as a preview only and defer the actual POST /companies/{id}/logo call until after
 * the company row exists - so this component never talks to the network itself,
 * unlike CompanyLogoUploader which it otherwise mirrors visually. */
export function CompanyLogoStager({ companyName, file, onFileChange }: CompanyLogoStagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function openFilePicker() {
    setError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;

    setError(null);
    if (!ALLOWED_TYPES.has(selected.type)) {
      setError("Please choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (selected.size > MAX_SIZE_BYTES) {
      setError("Image must be under 5MB.");
      return;
    }
    onFileChange(selected);
  }

  return (
    <div>
      <button
        type="button"
        onClick={openFilePicker}
        aria-label="Choose company logo"
        className="group relative block shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-coral"
      >
        <CompanyLogo logoUrl={previewUrl} companyName={companyName} size="lg" />
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 text-white opacity-0 transition-all duration-150 group-hover:bg-black/40 group-hover:opacity-100">
          <Camera className="h-6 w-6" aria-hidden="true" />
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      {file && (
        <button
          type="button"
          onClick={() => onFileChange(null)}
          className="mt-1.5 text-xs font-medium text-muted transition-colors hover:text-destructive"
        >
          Remove logo
        </button>
      )}
      {error && <p className="mt-1.5 max-w-[12rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}
