import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkAccessChange } from "./access-policy";

const A = "a", B = "b";

describe("access change policy", () => {
  it("denies self-approval and self-rejection", () => {
    expect(checkAccessChange({ kind: "status", actorId: A, targetId: A, status: "approved", targetRoleCount: 1 })).not.toBeNull();
    expect(checkAccessChange({ kind: "status", actorId: A, targetId: A, status: "rejected", targetRoleCount: 1 })).not.toBeNull();
  });

  it("denies self role grants", () => {
    expect(checkAccessChange({ kind: "assign-role", actorId: A, targetId: A, role: "admin" })).not.toBeNull();
  });

  it("requires a role before approval", () => {
    expect(checkAccessChange({ kind: "status", actorId: A, targetId: B, status: "approved", targetRoleCount: 0 })).not.toBeNull();
  });

  it("protects the last approved admin regardless of which admin initiates removal", () => {
    expect(checkAccessChange({ kind: "remove-role", actorId: A, targetId: B, role: "admin", adminCount: 1 })).not.toBeNull();
    expect(checkAccessChange({ kind: "remove-role", actorId: A, targetId: A, role: "admin", adminCount: 1 })).not.toBeNull();
  });

  it("allows an admin to approve another user with a role", () => {
    expect(checkAccessChange({ kind: "status", actorId: A, targetId: B, status: "approved", targetRoleCount: 1 })).toBeNull();
  });
});

describe("access policy server wiring", () => {
  it("enforces the policy from the server approval functions, not only in the UI", () => {
    const source = readFileSync(new URL("./approvals.functions.ts", import.meta.url), "utf8");
    expect(source).toContain('import { checkAccessChange } from "@/lib/access-policy"');
    expect(source).toContain('profile?.status !== "approved"');
    expect(source).toContain('kind: "status"');
    expect(source).toContain('kind: "assign-role"');
    expect(source).toContain('kind: "remove-role"');
    expect(source).toContain("getApprovedAdminCount(supabaseAdmin)");
  });

  it("fails closed when active-admin verification errors", () => {
    const source = readFileSync(new URL("./approvals.functions.ts", import.meta.url), "utf8");
    expect(source).toContain('if (rolesError || !adminRoles) throw new Error("Failed to verify active administrators")');
    expect(source).toContain('if (profilesError || !profiles) throw new Error("Failed to verify active administrators")');
  });
});
