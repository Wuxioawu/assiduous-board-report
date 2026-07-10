import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { createComment, deleteComment, listComments, updateComment } from "@/api/comments";
import { getErrorDetail } from "@/api/errors";
import { revertInsightToAi, updateInsight } from "@/api/insights";
import { InsightEditForm } from "@/components/insights/InsightEditForm";
import { StructuredInsightView } from "@/components/insights/StructuredInsightView";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { canEditData } from "@/lib/roles";
import type { User } from "@/types/auth";
import type { Comment } from "@/types/comment";
import type { Audience, Insight, InsightSeverity, StructuredInsightContent } from "@/types/insight";

const SEVERITY_STYLES: Record<InsightSeverity, string> = {
  info: "text-[var(--status-good)]",
  warning: "text-[var(--status-warning)]",
  critical: "text-[var(--status-critical)]",
};

const TEXTAREA_CLASS =
  "w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-coral focus:ring-1 focus:ring-coral";

interface InsightPanelProps {
  insight: Insight | null;
  onRegenerate: (confirmOverwriteEdit?: boolean) => Promise<void>;
  onInsightChange: (insight: Insight) => void;
  companyId: string;
  audience: Audience;
  period?: string;
  user: User | null;
}

export function InsightPanel({
  insight,
  onRegenerate,
  onInsightChange,
  companyId,
  audience,
  period,
  user,
}: InsightPanelProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRegenerateConfirm, setPendingRegenerateConfirm] = useState(false);

  const canWrite = !!user && canEditData(user.role);
  // Editing and deleting a comment are both OWNER-only, full stop - authorship
  // grants no exception (matches the backend's require_role(UserRole.OWNER) on
  // both PATCH and DELETE).
  const isOwner = !!user && user.role === "owner";

  // The edited version takes precedence over the AI draft whenever one exists -
  // same rule the PDF export uses, so what's shown here always matches what gets
  // exported.
  const displayContent: StructuredInsightContent | null = insight
    ? insight.is_edited && insight.edited_content
      ? insight.edited_content
      : insight.structured_content
    : null;

  const [isEditingInsight, setIsEditingInsight] = useState(false);
  const [editForm, setEditForm] = useState<StructuredInsightContent | null>(null);
  const [isSavingInsight, setIsSavingInsight] = useState(false);
  const [insightActionError, setInsightActionError] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [pendingRevert, setPendingRevert] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!period) {
      setComments([]);
      return;
    }
    let cancelled = false;
    setIsLoadingComments(true);
    setCommentError(null);
    listComments(companyId, period, audience)
      .then((data) => {
        if (!cancelled) setComments(data);
      })
      .catch(() => {
        if (!cancelled) setCommentError("Failed to load comments");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingComments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, audience, period]);

  async function doRegenerate(confirmOverwriteEdit: boolean) {
    setIsRegenerating(true);
    setError(null);
    try {
      await onRegenerate(confirmOverwriteEdit);
      setPendingRegenerateConfirm(false);
    } catch {
      setError("Failed to regenerate the AI commentary.");
    } finally {
      setIsRegenerating(false);
    }
  }

  function handleRegenerateClick() {
    if (insight?.is_edited) {
      setPendingRegenerateConfirm(true);
      return;
    }
    doRegenerate(false);
  }

  function startEditingInsight() {
    if (!displayContent) return;
    // Deep copy so Cancel never mutates the displayed content.
    setEditForm(JSON.parse(JSON.stringify(displayContent)) as StructuredInsightContent);
    setInsightActionError(null);
    setIsEditingInsight(true);
  }

  function cancelEditingInsight() {
    setIsEditingInsight(false);
    setEditForm(null);
    setInsightActionError(null);
  }

  async function saveInsightEdit() {
    if (!insight || !editForm) return;
    setIsSavingInsight(true);
    setInsightActionError(null);
    try {
      const payload: StructuredInsightContent = {
        ...editForm,
        watch_items: editForm.watch_items.map((item) => item.trim()).filter(Boolean),
      };
      const updated = await updateInsight(insight.id, payload);
      onInsightChange(updated);
      setIsEditingInsight(false);
      setEditForm(null);
    } catch (err) {
      setInsightActionError(getErrorDetail(err, "Failed to save your edits, please try again"));
    } finally {
      setIsSavingInsight(false);
    }
  }

  function closeRevertModal() {
    if (isReverting) return;
    setPendingRevert(false);
  }

  async function confirmRevert() {
    if (!insight) return;
    setIsReverting(true);
    setInsightActionError(null);
    try {
      const updated = await revertInsightToAi(insight.id);
      onInsightChange(updated);
      setPendingRevert(false);
    } catch (err) {
      setInsightActionError(getErrorDetail(err, "Failed to revert to the AI version, please try again"));
    } finally {
      setIsReverting(false);
    }
  }

  async function handlePost() {
    if (!period || !newComment.trim()) return;
    setIsPosting(true);
    setCommentError(null);
    try {
      const created = await createComment(companyId, period, audience, newComment.trim());
      setComments((prev) => [created, ...prev]);
      setNewComment("");
    } catch (err) {
      setCommentError(getErrorDetail(err, "Failed to post comment, please try again"));
    } finally {
      setIsPosting(false);
    }
  }

  function startEdit(comment: Comment) {
    setEditingId(comment.id);
    setEditValue(comment.content);
    setPendingDeleteId(null);
    setCommentError(null);
  }

  async function saveEdit(comment: Comment) {
    if (!editValue.trim()) return;
    setIsSavingEdit(true);
    setCommentError(null);
    try {
      const updated = await updateComment(comment.id, editValue.trim());
      setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setCommentError(getErrorDetail(err, "Failed to save comment, please try again"));
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function confirmDelete(commentId: string) {
    setIsDeleting(true);
    setCommentError(null);
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setPendingDeleteId(null);
    } catch (err) {
      setCommentError(getErrorDetail(err, "Failed to delete comment, please try again"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-navy">AI Commentary</h3>
        {!isEditingInsight && (
          <div className="flex gap-2">
            {displayContent && (
              <Button
                variant="secondary"
                onClick={startEditingInsight}
                disabled={!canWrite}
                title={canWrite ? undefined : "Only Owner/Admin/Analyst can edit the AI commentary"}
                className="flex items-center gap-1.5"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={handleRegenerateClick}
              disabled={isRegenerating || !canWrite}
              title={canWrite ? undefined : "Only Owner/Admin/Analyst can regenerate the AI commentary"}
            >
              {isRegenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

      {isEditingInsight && editForm ? (
        <InsightEditForm
          form={editForm}
          onChange={setEditForm}
          onSave={saveInsightEdit}
          onCancel={cancelEditingInsight}
          isSaving={isSavingInsight}
          error={insightActionError}
        />
      ) : insight ? (
        displayContent ? (
          <>
            {insight.is_edited && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-muted">
                  Edited by {insight.edited_by_name ?? "a team member"}
                  {insight.edited_at ? ` on ${new Date(insight.edited_at).toLocaleDateString()}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setPendingRevert(true)}
                  disabled={!canWrite}
                  title={canWrite ? undefined : "Only Owner/Admin/Analyst can revert to the AI version"}
                  className="text-xs font-medium text-muted underline transition-colors hover:text-navy disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline disabled:hover:text-muted"
                >
                  Revert to AI version
                </button>
              </div>
            )}
            {insightActionError && <p className="mb-2 text-sm text-destructive">{insightActionError}</p>}
            <StructuredInsightView content={displayContent} severity={insight.severity} />
          </>
        ) : (
          // Fallback for insights generated before structured_content existed.
          <>
            <p className={`mb-1 text-sm font-semibold ${SEVERITY_STYLES[insight.severity]}`}>{insight.title}</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-navy">{insight.body}</p>
          </>
        )
      ) : (
        <p className="text-sm text-muted">No AI commentary available yet.</p>
      )}

      <div className="mt-5 border-t border-surface-border pt-4">
        <h3 className="mb-4 text-base font-semibold text-navy">Team Comments</h3>

        {user && (
          // Shown disabled (not hidden) for VIEWER, who still can't type into it -
          // the disabled textarea can't receive input either way - but now with a
          // tooltip explaining why, rather than the box just not existing.
          <div className="mb-4 flex items-start gap-2">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment for the team…"
              rows={2}
              disabled={!canWrite}
              title={canWrite ? undefined : "Only Owner/Admin/Analyst can post comments"}
              className={`flex-1 disabled:cursor-not-allowed disabled:bg-cream disabled:text-muted ${TEXTAREA_CLASS}`}
            />
            <Button
              onClick={handlePost}
              disabled={isPosting || !newComment.trim() || !canWrite}
              title={canWrite ? undefined : "Only Owner/Admin/Analyst can post comments"}
            >
              {isPosting ? "Posting…" : "Post"}
            </Button>
          </div>
        )}

        {commentError && <p className="mb-2 text-sm text-destructive">{commentError}</p>}

        {isLoadingComments ? (
          <p className="text-sm text-muted">Loading comments…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <Avatar avatarUrl={comment.author_avatar_url} fullName={comment.author_name} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-navy">{comment.author_name}</span>
                    <span>{new Date(comment.created_at).toLocaleString()}</span>
                    {comment.edited && <span className="italic">(edited)</span>}
                  </div>

                  {editingId === comment.id ? (
                    <div className="mt-1 space-y-2">
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={2}
                        className={TEXTAREA_CLASS}
                      />
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setEditingId(null)} disabled={isSavingEdit}>
                          Cancel
                        </Button>
                        <Button onClick={() => saveEdit(comment)} disabled={isSavingEdit || !editValue.trim()}>
                          {isSavingEdit ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-navy">
                      {comment.content}
                    </p>
                  )}

                  {isOwner && editingId !== comment.id && (
                    <div className="mt-1 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => startEdit(comment)}
                        className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-navy"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Edit
                      </button>
                      {pendingDeleteId === comment.id ? (
                        <span className="flex items-center gap-2 text-xs text-muted">
                          Delete?
                          <button
                            type="button"
                            onClick={() => confirmDelete(comment.id)}
                            disabled={isDeleting}
                            className="font-medium text-destructive transition-colors hover:text-destructive-hover"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            disabled={isDeleting}
                            className="font-medium text-muted transition-colors hover:text-navy"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(comment.id)}
                          className="inline-flex items-center gap-1 text-xs text-destructive/60 transition-colors hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingRevert && (
        <Modal title="Revert to AI version" onClose={closeRevertModal}>
          <div className="mb-4 space-y-2 text-sm text-navy">
            <p>
              This will discard the manual edits to this commentary and restore the original AI-generated
              version. Your edit isn't lost from history, but it will no longer be shown or exported.
            </p>
            {insightActionError && <p className="text-sm text-destructive">{insightActionError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeRevertModal} disabled={isReverting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRevert} disabled={isReverting}>
              {isReverting ? "Reverting…" : "Revert to AI Version"}
            </Button>
          </div>
        </Modal>
      )}

      {pendingRegenerateConfirm && (
        <Modal title="Regenerate AI Commentary" onClose={() => setPendingRegenerateConfirm(false)}>
          <div className="mb-4 space-y-2 text-sm text-navy">
            <p>This will discard your manual edits and generate a new AI commentary. Continue?</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setPendingRegenerateConfirm(false)}
              disabled={isRegenerating}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={() => doRegenerate(true)} disabled={isRegenerating}>
              {isRegenerating ? "Regenerating…" : "Discard Edits & Regenerate"}
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
