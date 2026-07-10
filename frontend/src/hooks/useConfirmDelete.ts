import { useState } from "react";

import { getErrorDetail } from "@/api/errors";

interface UseConfirmDeleteResult<T> {
  /** The item awaiting confirmation, or null when no confirmation is pending -
   * render the confirmation Modal based on this being non-null. */
  pendingItem: T | null;
  isDeleting: boolean;
  error: string | null;
  /** Call from a row's "Delete" button to open the confirmation. */
  requestDelete: (item: T) => void;
  /** Call from the confirmation Modal's onClose/Cancel. */
  cancel: () => void;
  /** Call from the confirmation Modal's "Delete" button. */
  confirm: () => Promise<void>;
}

/** The "pending item + isDeleting + error + confirm modal" state machine
 * shared by every delete-confirmation flow in the app (Budget, Benchmark,
 * document deletion, team member removal/invitation revocation) - these were
 * five near-identical hand-rolled copies before this hook. `onDelete` does the
 * actual API call and any local list-state update (e.g. filtering the deleted
 * item out); this hook only owns the confirm/loading/error mechanics around
 * it. */
export function useConfirmDelete<T>(
  onDelete: (item: T) => Promise<void>,
  errorMessage = "Failed to delete, please try again",
): UseConfirmDeleteResult<T> {
  const [pendingItem, setPendingItem] = useState<T | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function requestDelete(item: T) {
    setError(null);
    setPendingItem(item);
  }

  function cancel() {
    if (isDeleting) return;
    setPendingItem(null);
    setError(null);
  }

  async function confirm() {
    if (!pendingItem) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(pendingItem);
      setPendingItem(null);
    } catch (err) {
      setError(getErrorDetail(err, errorMessage));
    } finally {
      setIsDeleting(false);
    }
  }

  return { pendingItem, isDeleting, error, requestDelete, cancel, confirm };
}
