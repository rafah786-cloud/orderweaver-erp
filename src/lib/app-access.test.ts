import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decideAppAccess } from "./app-access";
import { safeLocalRedirect } from "./safe-local-redirect";

const base = { loading: false, roles: [] as never[], pathname: "/accounting", href: "/accounting?x=1" };
const uid = "u1";

describe("app route guard", () => {
  it("waits while auth initialises (no protected content)", () => {
    expect(decideAppAccess({ ...base, loading: true, sessionUserId: null, profile: null }).kind).toBe("loading");
  });
  it("redirects unauthenticated direct access to login with the local path", () => {
    expect(decideAppAccess({ ...base, sessionUserId: null, profile: null })).toEqual({ kind: "login", redirect: "/accounting?x=1" });
  });
  it("drops unsafe redirect targets", () => {
    expect(decideAppAccess({ ...base, href: "//evil.com", sessionUserId: null, profile: null })).toEqual({ kind: "login", redirect: undefined });
    expect(safeLocalRedirect("https://evil.com")).toBeUndefined();
    expect(safeLocalRedirect("/\\evil")).toBeUndefined();
  });
  it("sends pending and rejected accounts to the pending screen", () => {
    expect(decideAppAccess({ ...base, sessionUserId: uid, profile: { id: uid, status: "pending" }, roles: ["admin"] }).kind).toBe("pending");
    expect(decideAppAccess({ ...base, sessionUserId: uid, profile: { id: uid, status: "rejected" }, roles: ["admin"] }).kind).toBe("pending");
  });
  it("does not trust a profile belonging to a different user", () => {
    expect(decideAppAccess({ ...base, sessionUserId: uid, profile: { id: "other", status: "approved" }, roles: ["admin"] }).kind).toBe("profile-loading");
  });
  it("allows approved users with a permitted role and denies others", () => {
    expect(decideAppAccess({ ...base, sessionUserId: uid, profile: { id: uid, status: "approved" }, roles: ["accountant"] }).kind).toBe("allow");
    expect(decideAppAccess({ ...base, sessionUserId: uid, profile: { id: uid, status: "approved" }, roles: ["employee"] }).kind).toBe("denied");
  });
});

describe("server function authorization", () => {
  // Files that are intentionally public and return no private data.
  const PUBLIC = new Set(["account-lookup.functions.ts"]);
  it("every server-function module requires a verified Supabase session", () => {
    const dir = join(__dirname);
    const files = readdirSync(dir).filter((f) => f.endsWith(".functions.ts"));
    const missing = files.filter((f) => !PUBLIC.has(f) && !readFileSync(join(dir, f), "utf8").includes("requireSupabaseAuth"));
    expect(missing).toEqual([]);
  });
  it("browser bearer attacher is registered globally", () => {
    const start = readFileSync(join(__dirname, "..", "start.ts"), "utf8");
    expect(start).toMatch(/functionMiddleware:\s*\[[^\]]*attachSupabaseAuth/);
  });
});
