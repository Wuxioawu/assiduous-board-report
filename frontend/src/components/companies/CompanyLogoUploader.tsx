import { Camera } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import { deleteCompanyLogo, uploadCompanyLogo } from "@/api/companies";
import { getErrorDetail } from "@/api/errors";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Spinner } from "@/components/ui/Spinner";
import type { Company } from "@/types/company";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface CompanyLogoUploaderProps {
  company: Company;
  /** Gated to ADMIN/OWNER by the caller, consistent with company-editing
   * permissions - other roles see a plain, non-interactive logo. */
  editable: boolean;
  onLogoChange: (logoUrl: string | null) => void;
}

export function CompanyLogoUploader({ company, editable, onLogoChange }: CompanyLogoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editable) {
    return <CompanyLogo logoUrl={company.logo_url} companyName={company.name} size="lg" />;
  }

  const isBusy = isUploading || isRemoving;

  function openFilePicker() {
    if (isBusy) return;
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setError("Please choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("Image must be under 5MB.");
      return;
    }

    // Show the picked file immediately as a local preview while the upload is in
    // flight - the previous logo (or placeholder) reappears automatically on
    // failure simply by clearing previewUrl, since the fallback always renders
    // from the still-unchanged company.logo_url.
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsUploading(true);
    try {
      const { logo_url } = await uploadCompanyLogo(company.id, file);
      onLogoChange(logo_url);
    } catch (err) {
      setError(getErrorDetail(err, "Failed to upload logo. Please try again."));
    } finally {
      setIsUploading(false);
      setPreviewUrl(null);
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleRemove() {
    setError(null);
    setIsRemoving(true);
    try {
      const { logo_url } = await deleteCompanyLogo(company.id);
      onLogoChange(logo_url);
    } catch (err) {
      setError(getErrorDetail(err, "Failed to remove logo. Please try again."));
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openFilePicker}
        disabled={isBusy}
        aria-label="Change company logo"
        className="group relative block shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-coral disabled:cursor-not-allowed"
      >
        <CompanyLogo logoUrl={previewUrl ?? company.logo_url} companyName={company.name} size="lg" />
        {!isUploading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 text-white opacity-0 transition-all duration-150 group-hover:bg-black/40 group-hover:opacity-100">
            <Camera className="h-6 w-6" aria-hidden="true" />
          </span>
        )}
        {isUploading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
            <Spinner className="h-6 w-6 text-white" />
          </span>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      {company.logo_url && !isUploading && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isBusy}
          className="mt-1.5 text-xs font-medium text-muted transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRemoving ? "Removing…" : "Remove logo"}
        </button>
      )}
      {error && <p className="mt-1.5 max-w-[12rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}
