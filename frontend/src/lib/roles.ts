import type { UserRole } from "@/types/auth";

// Mirrors the role checks enforced server-side (see backend app/core/deps.py
// require_role usage) so the UI can hide actions a role isn't permitted to
// take, without being the source of truth for authorization.
const ORG_MANAGE_ROLES: UserRole[] = ["owner", "admin"];
const DATA_EDIT_ROLES: UserRole[] = ["owner", "admin", "analyst"];

export function canManageOrg(role: UserRole): boolean {
  return ORG_MANAGE_ROLES.includes(role);
}

export function canEditData(role: UserRole): boolean {
  return DATA_EDIT_ROLES.includes(role);
}

export function invitableRoles(role: UserRole): UserRole[] {
  return role === "owner" ? ["owner", "admin", "analyst", "viewer"] : ["admin", "analyst", "viewer"];
}
