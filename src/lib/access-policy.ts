/**
 * Pure, server-enforced guard rules for privileged access changes.
 * Used by approvals server functions; tested in access-policy.test.ts.
 */
export type AccessChange =
  | { kind: "status"; actorId: string; targetId: string; status: string; targetRoleCount: number }
  | { kind: "remove-role"; actorId: string; targetId: string; role: string; adminCount: number }
  | { kind: "assign-role"; actorId: string; targetId: string; role: string };

export function checkAccessChange(change: AccessChange): string | null {
  if (change.actorId === change.targetId) {
    if (change.kind === "status") return "You cannot change your own approval status";
    if (change.kind === "assign-role") return "You cannot grant roles to yourself";
  }
  if (change.kind === "status" && change.status === "approved" && change.targetRoleCount < 1)
    return "Assign at least one role before approving this user";
  if (change.kind === "remove-role" && change.role === "admin" && change.adminCount <= 1)
    return "Cannot remove the last admin role";
  return null;
}
