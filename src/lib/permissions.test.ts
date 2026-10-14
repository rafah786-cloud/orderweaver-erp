import { describe, expect, it } from "vitest";
import { allowedRolesFor, isRouteDenied, ROUTE_ROLES } from "./permissions";

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

  it("does not grant access to similarly prefixed but unregistered routes", () => {
    expect(allowedRolesFor("/gst-archive")).toBeNull();
    expect(allowedRolesFor("/accounting-old")).toBeNull();
  });

  it("applies the parent screen policy to nested routes", () => {
    expect(allowedRolesFor("/gst/returns")).toEqual(["admin", "accountant"]);
    expect(allowedRolesFor("/tally-import/validate")).toEqual(["admin"]);
  });

  it("fails closed for unregistered private routes and restricts the generic workbench to admins", () => {
    expect(isRouteDenied("/unknown-finance-route", ["admin"])).toBe(true);
    expect(isRouteDenied("/enterprise-workbench", ["production"])).toBe(true);
    expect(isRouteDenied("/enterprise-workbench", ["admin"])).toBe(false);
    expect(isRouteDenied("/mrp", ["production"])).toBe(false);
  });

  it("contains no duplicate top-level route prefixes", () => {
    const prefixes = ROUTE_ROLES.map((entry) => entry.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
