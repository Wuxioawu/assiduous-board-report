import { Camera } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import { deleteAvatar, uploadAvatar } from "@/api/auth";
import { getErrorDetail } from "@/api/errors";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@/types/auth";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface AvatarUploaderProps {
  user: User;
}

export function AvatarUploader({ user }: AvatarUploaderProps) {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // flight - the previous photo (or initials) reappears automatically on failure
    // simply by clearing previewUrl, since the fallback below always renders from
    // the still-unchanged `user.avatar_url`.
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsUploading(true);
    try {
      await uploadAvatar(file);
      await refreshUser();
    } catch (err) {
      setError(getErrorDetail(err, "Failed to upload photo. Please try again."));
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
      await deleteAvatar();
      await refreshUser();
    } catch (err) {
      setError(getErrorDetail(err, "Failed to remove photo. Please try again."));
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
        aria-label="Change profile photo"
        className="group relative block shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-coral disabled:cursor-not-allowed"
      >
        <Avatar avatarUrl={previewUrl ?? user.avatar_url} fullName={user.full_name} size="lg" />
        {!isUploading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition-all duration-150 group-hover:bg-black/40 group-hover:opacity-100">
            <Camera className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        {isUploading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <Spinner className="h-5 w-5 text-white" />
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
      {user.avatar_url && !isUploading && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isBusy}
          className="mt-1.5 text-xs font-medium text-muted transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRemoving ? "Removing…" : "Remove photo"}
        </button>
      )}
      {error && <p className="mt-1.5 max-w-[10rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}
