import { describe, expect, it } from "vitest";
import { allowedRolesFor, ROUTE_ROLES } from "./permissions";

describe("ERP route security policy", () => {
  it("keeps financial administration restricted to finance roles", () => {
    expect(allowedRolesFor("/accounting")).toEqual(["admin", "accountant"]);
    expect(allowedRolesFor("/gst")).toEqual(["admin", "accountant"]);
    expect(allowedRolesFor("/banking")).toEqual(["admin", "accountant"]);
  });

  it("keeps migration controls admin-only", () => {
    expect(allowedRolesFor("/tally-import")).toEqual(["admin"]);
    expect(allowedRolesFor("/settings")).toEqual(["admin"]);
    expect(allowedRolesFor("/approvals")).toEqual(["admin"]);
  });

  it("does not accidentally expose an unknown route through this policy", () => {
    expect(allowedRolesFor("/unknown-finance-route")).toBeNull();
  });

  it("contains no duplicate top-level route prefixes", () => {
    const prefixes = ROUTE_ROLES.map((entry) => entry.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
