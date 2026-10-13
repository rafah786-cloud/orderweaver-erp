import { describe, expect, it } from "vitest";
import { allowedRolesFor, routePathMatches, ROUTE_ROLES } from "./permissions";

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


describe("route boundary matching", () => {
  it("matches parent routes and their nested screens", () => {
    expect(routePathMatches("/accounting", "/accounting")).toBe(true);
    expect(routePathMatches("/accounting/trial-balance", "/accounting")).toBe(true);
    expect(routePathMatches("/vendor/purchase-orders/123", "/vendor")).toBe(true);
  });

  it("rejects similarly prefixed sibling routes", () => {
    expect(routePathMatches("/accounting-extra", "/accounting")).toBe(false);
    expect(routePathMatches("/vendorish", "/vendor")).toBe(false);
    expect(routePathMatches("/settings-unsafe", "/settings")).toBe(false);
    expect(allowedRolesFor("/accounting-extra")).toBeNull();
    expect(allowedRolesFor("/settings-unsafe")).toBeNull();
  });

  it("normalizes trailing slashes", () => {
    expect(routePathMatches("/accounting/trial-balance/", "/accounting/")).toBe(true);
  });
});

describe("fail-closed role enforcement", () => {
  it("denies unmapped app paths even to administrators until a policy is added", () => {
    expect(canAccessPath("/unknown-app-module", ["admin"])).toBe(false);
    expect(canAccessPath("/unknown-app-module", ["sales"])).toBe(false);
  });

  it("restricts the generic enterprise workbench to administrators", () => {
    expect(canAccessPath("/enterprise-workbench", ["admin"])).toBe(true);
    expect(canAccessPath("/enterprise-workbench", ["accountant"])).toBe(false);
    expect(canAccessPath("/enterprise-workbench", ["production"])).toBe(false);
  });

  it("preserves nested route permissions for documented modules", () => {
    expect(canAccessPath("/accounting/trial-balance", ["accountant"])).toBe(true);
    expect(canAccessPath("/accounting/trial-balance", ["sales"])).toBe(false);
  });
});
