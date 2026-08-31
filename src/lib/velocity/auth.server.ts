import process from "node:process";

/**
 * Velocity Shipping authentication (server-only).
 *
 * Velocity issues a bearer token valid for 24h, and creating a new token
 * REVOKES the previous one. So we cache the token in the database and reuse
 * it until shortly before expiry. Credentials and token never leave the server.
 */

const DEFAULT_BASE_URL = "https://shazam.velocity.in";
const TOKEN_ROW_ID = "default";
// Refresh a little early so an in-flight request never uses an expiring token.
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

export function getVelocityBaseUrl(): string {
  return (process.env["VELOCITY_BASE_URL"] || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function getCredentials(): { username: string; password: string } {
  const username = process.env["VELOCITY_USERNAME"];
  const password = process.env["VELOCITY_PASSWORD"];
  if (!username || !password) {
    throw new Error("Velocity credentials are not configured (VELOCITY_USERNAME / VELOCITY_PASSWORD).");
  }
  return { username, password };
}

type CachedToken = { token: string; expiresAt: Date };

async function readCachedToken(): Promise<CachedToken | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("velocity_auth_token")
    .select("token, expires_at")
    .eq("id", TOKEN_ROW_ID)
    .maybeSingle();
  if (!data?.token || !data.expires_at) return null;
  return { token: data.token, expiresAt: new Date(data.expires_at) };
}

async function writeCachedToken(token: string, expiresAt: Date): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("velocity_auth_token")
    .upsert(
      {
        id: TOKEN_ROW_ID,
        token,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
}

function parseExpiry(raw: unknown): Date {
  if (typeof raw === "string" && raw.trim()) {
    // Velocity returns e.g. "2025-09-17T10:11:40" (no timezone) -> treat as UTC.
    const normalized = /(Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`;
    const d = new Date(normalized);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

/** Calls Velocity's auth endpoint and stores the new token. */
async function requestNewToken(): Promise<CachedToken> {
  const { username, password } = getCredentials();
  const res = await fetch(`${getVelocityBaseUrl()}/custom/api/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  if (!res.ok) {
    // Never log or surface credentials; only the provider's own message.
    const message =
      (typeof body["error"] === "string" && body["error"]) ||
      (typeof body["message"] === "string" && body["message"]) ||
      `Velocity auth failed with status ${res.status}`;
    throw new Error(message);
  }

  const token = typeof body["token"] === "string" ? body["token"] : "";
  if (!token) throw new Error("Velocity auth response did not include a token.");

  const expiresAt = parseExpiry(body["expires_at"]);
  await writeCachedToken(token, expiresAt);
  return { token, expiresAt };
}

/**
 * Returns a valid Velocity bearer token, reusing the cached one when possible.
 * Never return this value to the browser.
 */
export async function getVelocityToken(options?: { forceRefresh?: boolean }): Promise<string> {
  if (!options?.forceRefresh) {
    const cached = await readCachedToken();
    if (cached && cached.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()) {
      return cached.token;
    }
  }
  return (await requestNewToken()).token;
}

/** Auth health check: returns only non-sensitive metadata. */
export async function checkVelocityAuth(forceRefresh = false): Promise<{
  ok: boolean;
  source: "cache" | "fresh";
  expiresAt: string | null;
  error?: string;
}> {
  try {
    if (!forceRefresh) {
      const cached = await readCachedToken();
      if (cached && cached.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()) {
        return { ok: true, source: "cache", expiresAt: cached.expiresAt.toISOString() };
      }
    }
    const fresh = await requestNewToken();
    return { ok: true, source: "fresh", expiresAt: fresh.expiresAt.toISOString() };
  } catch (e) {
    return { ok: false, source: "fresh", expiresAt: null, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
