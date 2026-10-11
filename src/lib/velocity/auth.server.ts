import { z } from "zod";
import { VelocityApiError, safeVelocityFailure, velocityBaseUrl, velocityHttp, velocityHttpError } from "./http.server";

const TOKEN_ROW_ID = "default";
const EXPIRY_SKEW_MS = 5 * 60 * 1000;
const authResponse = z.object({ token: z.string().min(1), expires_at: z.string().min(1) });
type CachedToken = { token: string; expiresAt: Date };

export const getVelocityBaseUrl = velocityBaseUrl;

async function readCachedToken(): Promise<CachedToken | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("velocity_auth_token")
      .select("token, expires_at").eq("id", TOKEN_ROW_ID).maybeSingle();
    if (error) throw new VelocityApiError("CACHE_ERROR");
    if (!data?.token || !data.expires_at) return null;
    const expiresAt = new Date(data.expires_at);
    return Number.isFinite(expiresAt.getTime()) ? { token: data.token, expiresAt } : null;
  } catch { throw new VelocityApiError("CACHE_ERROR"); }
}

async function writeCachedToken(token: string, expiresAt: Date): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("velocity_auth_token").upsert({
      id: TOKEN_ROW_ID, token, expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw new VelocityApiError("CACHE_ERROR");
  } catch { throw new VelocityApiError("CACHE_ERROR"); }
}

function valid(token: CachedToken | null): token is CachedToken {
  return token !== null && token.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
}

/** Legacy authentication is retained, without inventing expiry or surfacing response bodies. */
async function requestNewToken(): Promise<CachedToken> {
  const username = process.env["VELOCITY_USERNAME"];
  const password = process.env["VELOCITY_PASSWORD"];
  if (!username || !password) throw new VelocityApiError("NOT_CONFIGURED");
  const response = await velocityHttp("/custom/api/v1/auth-token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (response.status < 200 || response.status >= 300) throw velocityHttpError(response.status);
  const parsed = authResponse.safeParse(response.body);
  if (!parsed.success) throw new VelocityApiError("INVALID_RESPONSE", response.status);
  const raw = parsed.data.expires_at;
  const expiresAt = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now()) {
    throw new VelocityApiError("INVALID_RESPONSE", response.status);
  }
  await writeCachedToken(parsed.data.token, expiresAt);
  return { token: parsed.data.token, expiresAt };
}

export async function getVelocityToken(options?: { forceRefresh?: boolean; rejectedToken?: string }): Promise<string> {
  const cached = await readCachedToken();
  // Another request may already have replaced the rejected token. Never revoke that replacement.
  if (valid(cached) && (!options?.forceRefresh ||
    (options.rejectedToken !== undefined && cached.token !== options.rejectedToken))) return cached.token;
  return (await requestNewToken()).token;
}

export async function checkVelocityAuth(): Promise<{
  ok: boolean; source: "cache" | "fresh"; expiresAt: string | null;
  error?: string; failure?: ReturnType<typeof safeVelocityFailure>;
}> {
  try {
    const cached = await readCachedToken();
    if (valid(cached)) return { ok: true, source: "cache", expiresAt: cached.expiresAt.toISOString() };
    const fresh = await requestNewToken();
    return { ok: true, source: "fresh", expiresAt: fresh.expiresAt.toISOString() };
  } catch (error) {
    const failure = safeVelocityFailure(error);
    return { ok: false, source: "fresh", expiresAt: null, error: failure.message, failure };
  }
}
