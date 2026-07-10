import { Mail, Trash2, UserMinus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { getErrorDetail } from "@/api/errors";
import {
  checkInviteEligibility,
  inviteMember,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "@/api/organizations";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useToast } from "@/hooks/useToast";
import { canManageOrg, invitableRoles } from "@/lib/roles";
import type { UserRole } from "@/types/auth";
import type { Invitation, Member } from "@/types/team";

interface PendingTransfer {
  email: string;
  role: UserRole;
  currentOrganizationName: string | null;
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

// Kept short by design (per the UX audit's ask for "brief" descriptions) - just
// enough to distinguish the four roles at a glance when inviting someone or
// scanning the members list, not a full permissions reference.
const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: "Full control - the only role that can edit or delete team comments, or change other members' roles.",
  admin: "Manages team members and edits financial data, budgets, and documents; can't edit or delete comments.",
  analyst: "Can upload documents, edit financial data and budgets, and post comments.",
  viewer: "Read-only - can view reports and dashboards, but can't make any changes.",
};

const ALL_ROLES: UserRole[] = ["owner", "admin", "analyst", "viewer"];

export function TeamSettingsView() {
  const { user, forceReauth } = useAuth();
  const { showToast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("viewer");
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);

  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const {
    pendingItem: pendingRemove,
    isDeleting: isRemoving,
    error: removeError,
    requestDelete: requestRemove,
    cancel: closeRemoveModal,
    confirm: confirmRemove,
  } = useConfirmDelete<Member>(async (member) => {
    await removeMember(member.id);
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    showToast(`${member.full_name} was removed from the organization.`);
  }, "Failed to remove member");

  const {
    pendingItem: pendingRevoke,
    isDeleting: isRevoking,
    error: revokeError,
    requestDelete: requestRevoke,
    cancel: closeRevokeModal,
    confirm: confirmRevoke,
  } = useConfirmDelete<Invitation>(async (invitation) => {
    await revokeInvitation(invitation.id);
    setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
    showToast(`Invitation to ${invitation.email} was revoked.`);
  }, "Failed to revoke invitation");

  useEffect(() => {
    Promise.all([listMembers(), listInvitations()])
      .then(([membersData, invitationsData]) => {
        setMembers(membersData);
        setInvitations(invitationsData);
      })
      .catch(() => setLoadError("Failed to load team data"))
      .finally(() => setIsLoading(false));
  }, []);

  if (user && !canManageOrg(user.role)) {
    return <Navigate to="/companies" replace />;
  }
  if (!user) return null;

  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isOwner = user.role === "owner";
  const inviteRoleOptions = invitableRoles(user.role);

  async function sendInvite(email: string, role: UserRole) {
    setInviteError(null);
    setIsInviting(true);
    try {
      const invitation = await inviteMember({ email, role });
      setInvitations((prev) => [invitation, ...prev]);
      setInviteEmail("");
      setInviteRole("viewer");
      setPendingTransfer(null);
      showToast(`Invitation sent to ${email}.`);
    } catch (err) {
      setInviteError(getErrorDetail(err, "Failed to send invitation"));
    } finally {
      setIsInviting(false);
    }
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setInviteError(null);
    setPendingTransfer(null);
    setIsCheckingEligibility(true);
    try {
      const eligibility = await checkInviteEligibility(inviteEmail);
      if (eligibility.invitation_type === "transfer") {
        // Don't send anything yet - let the admin confirm the transfer implication first.
        setPendingTransfer({
          email: inviteEmail,
          role: inviteRole,
          currentOrganizationName: eligibility.current_organization_name,
        });
      } else {
        await sendInvite(inviteEmail, inviteRole);
      }
    } catch (err) {
      setInviteError(getErrorDetail(err, "Failed to send invitation"));
    } finally {
      setIsCheckingEligibility(false);
    }
  }

  async function handleRoleChange(member: Member, role: UserRole) {
    setRoleError(null);
    setRoleUpdatingId(member.id);
    try {
      const updated = await updateMemberRole(member.id, { role });
      // The JWT's role claim is fixed at login and never revoked, so if the caller just
      // changed their OWN role, their current session token still grants the OLD
      // permissions - leaving it in place would cause confusing 403s on actions the new
      // role should allow (or silently over-permission them) until they happened to log
      // out and back in. Force that re-login now, with an explanation, instead.
      if (member.id === user?.id) {
        forceReauth(`Your role was changed to ${ROLE_LABELS[role]}. Please log in again to continue.`);
        return;
      }
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      showToast(`${member.full_name}'s role was changed to ${ROLE_LABELS[role]}.`);
    } catch (err) {
      setRoleError(getErrorDetail(err, `Failed to update ${member.full_name}'s role`));
    } finally {
      setRoleUpdatingId(null);
    }
  }

  function canRemove(member: Member): boolean {
    if (member.id === user!.id) return false;
    if (member.role === "owner" && !isOwner) return false;
    if (member.role === "owner" && ownerCount <= 1) return false;
    return true;
  }

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-bold text-navy">Team</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        Manage who has access to your organization and what they can do.
      </p>

      {loadError && <p className="mb-4 text-sm text-destructive">{loadError}</p>}

      <Card title="Invite Member" className="mb-6">
        {/* items-start (not items-end): both columns' labels must start on the
         * same line. Without this, the Role column's description paragraph makes
         * it taller than the Email column, and items-end would then push Email's
         * label/input down to stay bottom-aligned with Role - exactly the
         * misalignment this fixes. */}
        <form onSubmit={handleInvite} className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex-1">
            <Input
              label="Email"
              type="email"
              name="inviteEmail"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setPendingTransfer(null);
              }}
              required
            />
          </div>
          <div className="flex flex-col gap-1 sm:w-64">
            <label htmlFor="inviteRole" className="text-sm font-medium text-navy">
              Role
            </label>
            <select
              id="inviteRole"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="min-h-[44px] rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-coral focus:ring-1 focus:ring-coral"
            >
              {inviteRoleOptions.map((role) => (
                <option key={role} value={role} title={ROLE_DESCRIPTIONS[role]}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {/* Fixed min-height (not just auto) sized for the longest role
             * description, so switching roles never reflows/jumps the row -
             * shorter descriptions just leave the remaining space blank. */}
            <p className="min-h-[3.5rem] text-xs leading-snug text-muted">{ROLE_DESCRIPTIONS[inviteRole]}</p>
          </div>
          <div className="flex flex-col gap-1">
            {/* Invisible label-height spacer so the button lines up with the
             * Email/Role inputs, not their labels, now that the row is
             * top-aligned. */}
            <span className="hidden text-sm font-medium sm:block" aria-hidden="true">
              &nbsp;
            </span>
            <Button
              type="submit"
              disabled={isCheckingEligibility || isInviting || pendingTransfer !== null}
              className="w-full sm:w-auto"
            >
              {isCheckingEligibility ? "Checking…" : isInviting ? "Sending…" : "Send Invite"}
            </Button>
          </div>
        </form>
        {inviteError && <p className="mt-3 text-sm text-destructive">{inviteError}</p>}
        {pendingTransfer && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              <strong>{pendingTransfer.email}</strong> belongs to an existing account
              {pendingTransfer.currentOrganizationName ? (
                <>
                  {" "}
                  under <strong>{pendingTransfer.currentOrganizationName}</strong>
                </>
              ) : null}
              . Send a transfer invitation instead? They'll confirm by logging in with their
              existing password, and will lose access to{" "}
              {pendingTransfer.currentOrganizationName ?? "their current organization"} once accepted. If
              they're the only member there, they'll also be asked to delete it as part of completing
              the move — it's worth giving them a heads-up before they click the link.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPendingTransfer(null)}
                disabled={isInviting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => sendInvite(pendingTransfer.email, pendingTransfer.role)}
                disabled={isInviting}
              >
                {isInviting ? "Sending…" : "Send Transfer Invitation"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4" />
          Loading…
        </p>
      ) : (
        <>
          <Card title="Members" className="mb-6">
            {roleError && <p className="mb-3 text-sm text-destructive">{roleError}</p>}

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Joined</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-t border-surface-border">
                      <td className="py-2 text-navy">
                        <div className="flex items-center gap-2">
                          <Avatar avatarUrl={member.avatar_url} fullName={member.full_name} size="sm" />
                          {member.full_name}
                          {member.id === user.id && (
                            <span className="text-xs text-muted">(you)</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-muted">{member.email}</td>
                      <td className="py-2">
                        {isOwner ? (
                          <select
                            value={member.role}
                            disabled={roleUpdatingId === member.id}
                            onChange={(e) => handleRoleChange(member, e.target.value as UserRole)}
                            className="rounded-lg border border-surface-border bg-white px-2 py-1 text-sm text-navy outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral"
                          >
                            {ALL_ROLES.map((role) => (
                              <option key={role} value={role} title={ROLE_DESCRIPTIONS[role]}>
                                {ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-navy" title={ROLE_DESCRIPTIONS[member.role]}>
                            {ROLE_LABELS[member.role]}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 text-muted">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-right">
                        {canRemove(member) && (
                          <button
                            type="button"
                            onClick={() => requestRemove(member)}
                            className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-destructive/60 transition-colors hover:text-destructive"
                          >
                            <UserMinus className="h-4 w-4" aria-hidden="true" />
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 sm:hidden">
              {members.map((member) => (
                <div key={member.id} className="rounded-lg border border-surface-border p-3">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Avatar avatarUrl={member.avatar_url} fullName={member.full_name} size="sm" />
                      <p className="min-w-0 break-words text-sm font-medium text-navy">
                        {member.full_name}
                        {member.id === user.id && <span className="ml-1 text-xs text-muted">(you)</span>}
                      </p>
                    </div>
                    {canRemove(member) && (
                      <button
                        type="button"
                        onClick={() => requestRemove(member)}
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-destructive/60 transition-colors hover:text-destructive"
                      >
                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="mb-2 break-words text-xs text-muted">{member.email}</p>
                  <div className="flex items-center justify-between gap-2">
                    {isOwner ? (
                      <select
                        value={member.role}
                        disabled={roleUpdatingId === member.id}
                        onChange={(e) => handleRoleChange(member, e.target.value as UserRole)}
                        className="min-h-[44px] rounded-lg border border-surface-border bg-white px-2 py-1 text-sm text-navy outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral"
                      >
                        {ALL_ROLES.map((role) => (
                          <option key={role} value={role} title={ROLE_DESCRIPTIONS[role]}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-navy" title={ROLE_DESCRIPTIONS[member.role]}>
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      Joined {new Date(member.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Pending Invitations">
            {invitations.length === 0 ? (
              <p className="text-sm text-muted">No pending invitations.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-muted">
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Role</th>
                        <th className="pb-2 font-medium">Expires</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map((invitation) => (
                        <tr key={invitation.id} className="border-t border-surface-border">
                          <td className="py-2 text-navy">
                            <span className="inline-flex items-center gap-1.5">
                              <Mail className="h-4 w-4 text-muted" aria-hidden="true" />
                              {invitation.email}
                              {invitation.invitation_type === "transfer" && (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                  Transfer
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-2 text-navy">
                            {ROLE_LABELS[invitation.role]}
                          </td>
                          <td className="whitespace-nowrap py-2 text-muted">
                            {new Date(invitation.expires_at).toLocaleDateString()}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => requestRevoke(invitation)}
                              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-destructive/60 transition-colors hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 sm:hidden">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="rounded-lg border border-surface-border p-3"
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 break-words text-sm font-medium text-navy">
                          <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                          {invitation.email}
                          {invitation.invitation_type === "transfer" && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Transfer
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => requestRevoke(invitation)}
                          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-destructive/60 transition-colors hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Revoke
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>{ROLE_LABELS[invitation.role]}</span>
                        <span>Expires {new Date(invitation.expires_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {pendingRemove && (
        <Modal title="Remove Member" onClose={closeRemoveModal}>
          <div className="mb-4 space-y-2 text-sm text-navy">
            <p>
              Remove{" "}
              <span className="font-semibold text-navy">{pendingRemove.full_name}</span>{" "}
              from the organization?
            </p>
            {removeError && <p className="text-sm text-destructive">{removeError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeRemoveModal} disabled={isRemoving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRemove} disabled={isRemoving}>
              {isRemoving ? "Removing…" : "Remove"}
            </Button>
          </div>
        </Modal>
      )}

      {pendingRevoke && (
        <Modal title="Revoke Invitation" onClose={closeRevokeModal}>
          <div className="mb-4 space-y-2 text-sm text-navy">
            <p>
              Revoke the invitation sent to{" "}
              <span className="font-semibold text-navy">{pendingRevoke.email}</span>?
            </p>
            {revokeError && <p className="text-sm text-destructive">{revokeError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeRevokeModal} disabled={isRevoking}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRevoke} disabled={isRevoking}>
              {isRevoking ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
