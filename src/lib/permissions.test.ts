import { describe, expect, it } from "vitest";
import { allowedRolesFor, isRouteDenied, routePathMatches, ROUTE_ROLES } from "./permissions";

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

describe("route boundary matching", () => {
  it("matches a route and its nested screens, normalizing trailing slashes", () => {
    expect(routePathMatches("/accounting", "/accounting")).toBe(true);
    expect(routePathMatches("/accounting/trial-balance", "/accounting")).toBe(true);
    expect(routePathMatches("/accounting/trial-balance/", "/accounting/")).toBe(true);
  });

  it("rejects similarly prefixed siblings and unmapped paths", () => {
    expect(routePathMatches("/accounting-extra", "/accounting")).toBe(false);
    expect(routePathMatches("/vendorish", "/vendor")).toBe(false);
    expect(allowedRolesFor("/accounting-extra")).toBeNull();
    expect(isRouteDenied("/unknown-app-module", ["admin"])).toBe(true);
  });
});

describe("top-level route and permission inventory", () => {
  it("maps every role policy to an existing top-level route file", async () => {
    const { readdirSync } = await import("node:fs");
    const routeFiles = new Set(readdirSync(new URL("../routes/", import.meta.url)));
    for (const { prefix } of ROUTE_ROLES) {
      const routeFile = `_app.${prefix.slice(1).replaceAll("/", ".")}.tsx`;
      expect(routeFiles.has(routeFile), `Missing route file for ${prefix}: ${routeFile}`).toBe(true);
    }
  });

  it("does not leave a top-level private route without an explicit role policy", async () => {
    const { readdirSync } = await import("node:fs");
    const routeFiles = readdirSync(new URL("../routes/", import.meta.url))
      .filter((file) => file !== "_app.tsx" && file.startsWith("_app.") && file.endsWith(".tsx") && !file.slice(5, -4).includes("."))
      .map((file) => `/${file.slice(5, -4)}`);
    const configured = new Set(ROUTE_ROLES.map(({ prefix }) => prefix));
    for (const path of routeFiles) {
      expect(configured.has(path), `Missing role policy for route ${path}`).toBe(true);
    }
  });

  it("ensures every nested private route inherits a registered parent policy", async () => {
    const { readdirSync } = await import("node:fs");
    const routeFiles = readdirSync(new URL("../routes/", import.meta.url))
      .filter((file) => file.startsWith("_app.") && file.endsWith(".tsx"))
      .map((file) => `/${file.slice(5, -4).replaceAll(".", "/")}`);

    for (const path of routeFiles) {
      expect(allowedRolesFor(path), `Missing role policy for private route ${path}`).not.toBeNull();
    }
  });
});
