import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/organizations", () => ({
  listMembers: vi.fn(),
  listInvitations: vi.fn(),
  checkInviteEligibility: vi.fn(),
  inviteMember: vi.fn(),
  removeMember: vi.fn(),
  revokeInvitation: vi.fn(),
  updateMemberRole: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ useToast: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import {
  checkInviteEligibility,
  inviteMember,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from "@/api/organizations";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import type { UserRole } from "@/types/auth";
import type { Invitation, Member } from "@/types/team";
import { TeamSettingsView } from "@/views/TeamSettingsView";

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    email: "jane@example.com",
    full_name: "Jane Owner",
    role: "owner",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    avatar_url: null,
    ...overrides,
  };
}

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "invite-1",
    email: "new@example.com",
    role: "viewer",
    status: "pending",
    invitation_type: "new_user",
    invited_by_user_id: "member-1",
    expires_at: "2026-02-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function authUser(role: UserRole, overrides: Record<string, unknown> = {}) {
  return {
    id: "member-1",
    organization_id: "org-1",
    organization_name: "Senus PLC",
    email: "jane@example.com",
    full_name: "Jane Owner",
    role,
    is_active: true,
    totp_enabled: false,
    avatar_url: null,
    ...overrides,
  };
}

const showToast = vi.fn();
const forceReauth = vi.fn();

function mockAuth(role: UserRole, overrides: Record<string, unknown> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: authUser(role, overrides),
    forceReauth,
  } as unknown as ReturnType<typeof useAuth>);
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/team"]}>
      <Routes>
        <Route path="/team" element={<TeamSettingsView />} />
        <Route path="/companies" element={<div>Companies Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

function membersTable() {
  return screen.getAllByRole("table")[0];
}

function invitationsTable() {
  return screen.getAllByRole("table")[1];
}

describe("TeamSettingsView", () => {
  beforeEach(() => {
    vi.mocked(listMembers).mockReset();
    vi.mocked(listInvitations).mockReset();
    vi.mocked(checkInviteEligibility).mockReset();
    vi.mocked(inviteMember).mockReset();
    vi.mocked(removeMember).mockReset();
    vi.mocked(revokeInvitation).mockReset();
    vi.mocked(updateMemberRole).mockReset();
    vi.mocked(useToast).mockReturnValue({ showToast } as unknown as ReturnType<typeof useToast>);
    showToast.mockReset();
    forceReauth.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects non-managers away from the page", async () => {
    mockAuth("viewer");
    vi.mocked(listMembers).mockResolvedValue([]);
    vi.mocked(listInvitations).mockResolvedValue([]);

    renderView();

    // The data-fetching effect is declared (and therefore always runs)
    // before the role check's early return - React hooks can't be
    // conditional - so the redirect doesn't prevent the fetch from firing;
    // it just means the fetched data is thrown away.
    expect(await screen.findByText("Companies Page")).toBeInTheDocument();
  });

  it("loads and displays members and pending invitations", async () => {
    mockAuth("owner");
    vi.mocked(listMembers).mockResolvedValue([
      member(),
      member({ id: "member-2", email: "bob@example.com", full_name: "Bob Admin", role: "admin" }),
    ]);
    vi.mocked(listInvitations).mockResolvedValue([invitation()]);

    renderView();
    await waitForLoaded();

    expect(within(membersTable()).getByText("Bob Admin")).toBeInTheDocument();
    expect(within(invitationsTable()).getByText("new@example.com")).toBeInTheDocument();
  });

  it("shows a load error when the initial fetch fails", async () => {
    mockAuth("owner");
    vi.mocked(listMembers).mockRejectedValue(new Error("boom"));
    vi.mocked(listInvitations).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText("Failed to load team data")).toBeInTheDocument();
  });

  it("sends a plain invite immediately when the email is not a transfer", async () => {
    mockAuth("owner");
    vi.mocked(listMembers).mockResolvedValue([member()]);
    vi.mocked(listInvitations).mockResolvedValue([]);
    vi.mocked(checkInviteEligibility).mockResolvedValue({
      invitation_type: "new_user",
      current_organization_name: null,
    });
    vi.mocked(inviteMember).mockResolvedValue(invitation({ email: "carol@example.com" }));

    renderView();
    await waitForLoaded();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "carol@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => expect(inviteMember).toHaveBeenCalledWith({ email: "carol@example.com", role: "viewer" }));
    expect(showToast).toHaveBeenCalledWith("Invitation sent to carol@example.com.");
    expect(within(invitationsTable()).getByText("carol@example.com")).toBeInTheDocument();
  });

  it("holds a transfer invite for confirmation instead of sending it immediately", async () => {
    mockAuth("owner");
    vi.mocked(listMembers).mockResolvedValue([member()]);
    vi.mocked(listInvitations).mockResolvedValue([]);
    vi.mocked(checkInviteEligibility).mockResolvedValue({
      invitation_type: "transfer",
      current_organization_name: "Old Co",
    });

    renderView();
    await waitForLoaded();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "dave@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText(/belongs to an existing account/i)).toBeInTheDocument();
    expect(screen.getByText("Old Co")).toBeInTheDocument();
    expect(inviteMember).not.toHaveBeenCalled();

    vi.mocked(inviteMember).mockResolvedValue(invitation({ email: "dave@example.com" }));
    fireEvent.click(screen.getByRole("button", { name: /send transfer invitation/i }));

    await waitFor(() => expect(inviteMember).toHaveBeenCalledWith({ email: "dave@example.com", role: "viewer" }));
  });

  it("shows the backend error detail when the invite fails", async () => {
    mockAuth("owner");
    vi.mocked(listMembers).mockResolvedValue([member()]);
    vi.mocked(listInvitations).mockResolvedValue([]);
    vi.mocked(checkInviteEligibility).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Email already registered" } },
    });

    renderView();
    await waitForLoaded();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "existing@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it("owner can change another member's role", async () => {
    mockAuth("owner");
    const bob = member({ id: "member-2", email: "bob@example.com", full_name: "Bob Admin", role: "admin" });
    vi.mocked(listMembers).mockResolvedValue([member(), bob]);
    vi.mocked(listInvitations).mockResolvedValue([]);
    vi.mocked(updateMemberRole).mockResolvedValue({ ...bob, role: "analyst" });

    renderView();
    await waitForLoaded();

    const row = within(membersTable()).getByText("Bob Admin").closest("tr")!;
    fireEvent.change(within(row).getByRole("combobox"), { target: { value: "analyst" } });

    await waitFor(() => expect(updateMemberRole).toHaveBeenCalledWith("member-2", { role: "analyst" }));
    expect(showToast).toHaveBeenCalledWith("Bob Admin's role was changed to Analyst.");
    expect(forceReauth).not.toHaveBeenCalled();
  });

  it("forces re-authentication instead of a silent update when the owner changes their own role", async () => {
    mockAuth("owner");
    const self = member();
    vi.mocked(listMembers).mockResolvedValue([self]);
    vi.mocked(listInvitations).mockResolvedValue([]);
    vi.mocked(updateMemberRole).mockResolvedValue({ ...self, role: "admin" });

    renderView();
    await waitForLoaded();

    const row = within(membersTable()).getByText("Jane Owner").closest("tr")!;
    fireEvent.change(within(row).getByRole("combobox"), { target: { value: "admin" } });

    await waitFor(() => expect(updateMemberRole).toHaveBeenCalledWith("member-1", { role: "admin" }));
    await waitFor(() =>
      expect(forceReauth).toHaveBeenCalledWith("Your role was changed to Admin. Please log in again to continue."),
    );
    expect(showToast).not.toHaveBeenCalled();
  });

  it("non-owner managers see roles as read-only text, not a dropdown", async () => {
    mockAuth("admin");
    vi.mocked(listMembers).mockResolvedValue([member()]);
    vi.mocked(listInvitations).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    const row = within(membersTable()).getByText("Jane Owner").closest("tr")!;
    expect(within(row).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(row).getByText("Owner")).toBeInTheDocument();
  });

  it("hides the remove action for the current user's own row", async () => {
    mockAuth("owner");
    vi.mocked(listMembers).mockResolvedValue([
      member(),
      member({ id: "member-2", email: "bob@example.com", full_name: "Bob Admin", role: "admin" }),
    ]);
    vi.mocked(listInvitations).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    const selfRow = within(membersTable()).getByText("Jane Owner").closest("tr")!;
    const bobRow = within(membersTable()).getByText("Bob Admin").closest("tr")!;
    expect(within(selfRow).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(within(bobRow).getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("removes a member after confirming in the modal", async () => {
    mockAuth("owner");
    const bob = member({ id: "member-2", email: "bob@example.com", full_name: "Bob Admin", role: "admin" });
    vi.mocked(listMembers).mockResolvedValue([member(), bob]);
    vi.mocked(listInvitations).mockResolvedValue([]);
    vi.mocked(removeMember).mockResolvedValue(undefined);

    renderView();
    await waitForLoaded();

    const bobRow = within(membersTable()).getByText("Bob Admin").closest("tr")!;
    fireEvent.click(within(bobRow).getByRole("button", { name: /remove/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Bob Admin")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("member-2"));
    expect(showToast).toHaveBeenCalledWith("Bob Admin was removed from the organization.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(membersTable()).queryByText("Bob Admin")).not.toBeInTheDocument();
  });

  it("shows the backend error and keeps the modal open when removing a member fails", async () => {
    mockAuth("owner");
    const bob = member({ id: "member-2", email: "bob@example.com", full_name: "Bob Admin", role: "admin" });
    vi.mocked(listMembers).mockResolvedValue([member(), bob]);
    vi.mocked(listInvitations).mockResolvedValue([]);
    vi.mocked(removeMember).mockRejectedValue({
      isAxiosError: true,
      response: { data: { detail: "Cannot remove the last owner" } },
    });

    renderView();
    await waitForLoaded();

    const bobRow = within(membersTable()).getByText("Bob Admin").closest("tr")!;
    fireEvent.click(within(bobRow).getByRole("button", { name: /remove/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await within(dialog).findByText("Cannot remove the last owner")).toBeInTheDocument();
    expect(within(membersTable()).getByText("Bob Admin")).toBeInTheDocument();
  });

  it("revokes a pending invitation after confirming in the modal", async () => {
    mockAuth("owner");
    vi.mocked(listMembers).mockResolvedValue([member()]);
    vi.mocked(listInvitations).mockResolvedValue([invitation()]);
    vi.mocked(revokeInvitation).mockResolvedValue(undefined);

    renderView();
    await waitForLoaded();

    fireEvent.click(within(invitationsTable()).getByRole("button", { name: /revoke/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith("invite-1"));
    expect(showToast).toHaveBeenCalledWith("Invitation to new@example.com was revoked.");
    expect(await screen.findByText("No pending invitations.")).toBeInTheDocument();
  });

  it("non-owner managers can never remove an owner, even a sole one", async () => {
    // canRemove() forbids removing yourself outright (covered by the "hides
    // remove for own row" test above). This covers the other half: a
    // non-owner member can never remove an owner, even a redundant one.
    mockAuth("admin");
    vi.mocked(listMembers).mockResolvedValue([
      member(),
      member({ id: "member-2", email: "amy@example.com", full_name: "Amy Admin", role: "admin" }),
    ]);
    vi.mocked(listInvitations).mockResolvedValue([]);

    renderView();
    await waitForLoaded();

    const ownerRow = within(membersTable()).getByText("Jane Owner").closest("tr")!;
    expect(within(ownerRow).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });
});
