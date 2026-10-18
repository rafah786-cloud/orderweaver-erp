import { describe, expect, it } from "vitest";
import { checkAccessChange } from "./access-policy";

const A = "a", B = "b";
describe("access change policy", () => {
  it("denies self-approval", () => {
    expect(checkAccessChange({ kind: "status", actorId: A, targetId: A, status: "approved", targetRoleCount: 1 })).not.toBeNull();
  });
  it("denies self role grants", () => {
    expect(checkAccessChange({ kind: "assign-role", actorId: A, targetId: A, role: "admin" })).not.toBeNull();
  });
  it("requires a role before approval", () => {
    expect(checkAccessChange({ kind: "status", actorId: A, targetId: B, status: "approved", targetRoleCount: 0 })).not.toBeNull();
  });
  it("protects the last admin even when removed by someone else", () => {
    expect(checkAccessChange({ kind: "remove-role", actorId: A, targetId: B, role: "admin", adminCount: 1 })).not.toBeNull();
  });
  it("allows an admin to approve another user with a role", () => {
    expect(checkAccessChange({ kind: "status", actorId: A, targetId: B, status: "approved", targetRoleCount: 1 })).toBeNull();
  });
});
