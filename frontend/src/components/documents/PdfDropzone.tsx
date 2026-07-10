import { AlertCircle, FileText, Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import { DeterminateProgressBar, IndeterminateProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";

const MAX_SIZE_BYTES = 20 * 1024 * 1024;

type Status =
  | { kind: "idle" }
  | { kind: "staged"; file: File }
  | { kind: "uploading"; file: File; progress: number | null }
  | { kind: "error"; message: string; file: File | null };

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validate(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Only PDF files are supported.";
  if (file.size > MAX_SIZE_BYTES) return "File exceeds the 20MB limit.";
  return null;
}

interface PdfDropzoneProps {
  /** Performs the actual upload; the component only owns the drag/drop/staging UI and
   * calls this once the user confirms, reporting progress back via onProgress. */
  onUpload: (file: File, onProgress: (percent: number) => void) => Promise<void>;
}

export function PdfDropzone({ onUpload }: PdfDropzoneProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  function stageFile(file: File) {
    const validationError = validate(file);
    if (validationError) {
      setStatus({ kind: "error", message: validationError, file: null });
      return;
    }
    setStatus({ kind: "staged", file });
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) stageFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) stageFile(file);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (status.kind === "idle" || status.kind === "error") setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function openPicker() {
    if (status.kind === "uploading") return;
    inputRef.current?.click();
  }

  function handleZoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  }

  function clearSelection() {
    setStatus({ kind: "idle" });
  }

  async function handleUploadClick() {
    const file = status.kind === "staged" || status.kind === "error" ? status.file : null;
    if (!file) return;
    setStatus({ kind: "uploading", file, progress: null });
    try {
      await onUpload(file, (percent) => {
        setStatus((prev) => (prev.kind === "uploading" ? { ...prev, progress: percent } : prev));
      });
      setStatus({ kind: "idle" });
      showToast(`"${file.name}" uploaded — extraction is running in the background.`);
    } catch {
      setStatus({ kind: "error", message: "Upload failed. Please try again.", file });
    }
  }

  // A validation rejection (wrong type/too large) never had a file worth keeping around,
  // so it shows the empty dropzone with an error message. An upload-time failure is
  // different - the file was valid, so it stays staged (with the error alongside it) so
  // the user can just retry instead of re-selecting it.
  const stagedFile = status.kind === "staged" || status.kind === "uploading" ? status.file : status.kind === "error" ? status.file : null;
  const hasError = status.kind === "error";
  const isUploading = status.kind === "uploading";

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {!stagedFile ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a PDF document. Drag and drop a file here, or press Enter to browse."
          onClick={openPicker}
          onKeyDown={handleZoneKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 ${
            hasError
              ? "border-destructive/40 bg-destructive/5"
              : isDragOver
                ? "border-coral bg-coral/5"
                : "border-surface-border bg-cream/60 hover:border-coral/50 hover:bg-coral/5"
          }`}
        >
          {hasError ? (
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
          ) : (
            <Upload className={`h-8 w-8 ${isDragOver ? "text-coral" : "text-muted"}`} aria-hidden="true" />
          )}
          <p className={`text-sm font-medium ${hasError ? "text-destructive" : "text-navy"}`}>
            {hasError ? status.message : "Drag and drop a PDF here, or click to browse"}
          </p>
          <p className="text-xs text-muted">PDF only, up to 20MB</p>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-border bg-cream/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-coral">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-navy">{stagedFile.name}</p>
              <p className="text-xs text-muted">{formatFileSize(stagedFile.size)}</p>
            </div>
            {!isUploading && (
              <button
                type="button"
                onClick={clearSelection}
                aria-label="Remove selected file"
                className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-white hover:text-destructive"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {hasError && <p className="mt-2 text-sm text-destructive">{status.message}</p>}

          {isUploading && (
            <div className="mt-3">
              {status.progress != null ? (
                <DeterminateProgressBar progress={status.progress} label="Uploading document" />
              ) : (
                <IndeterminateProgressBar />
              )}
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <Button type="button" onClick={handleUploadClick} disabled={isUploading}>
              {isUploading ? "Uploading…" : hasError ? "Retry Upload" : "Upload"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
