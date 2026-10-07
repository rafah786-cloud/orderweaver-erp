import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(2048),
  p256dh: z.string().min(40).max(100),
  auth: z.string().min(16).max(100),
  expirationTime: z.number().int().nonnegative().nullable().optional(),
  userAgent: z.string().max(1000).nullable().optional(),
  deviceLabel: z.string().max(120).nullable().optional(),
});

function vapidPublicKey(): string | null {
  const configured = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  if (configured) return configured;
  const raw = process.env.WEB_PUSH_VAPID_PRIVATE_JWK?.trim();
  if (!raw) return null;
  try {
    const jwk = JSON.parse(raw);
    if (jwk?.kty !== "EC" || jwk?.crv !== "P-256" || !jwk.x || !jwk.y) return null;
    return bytesToBase64Url(
      concat(new Uint8Array([4]), base64UrlToBytes(jwk.x), base64UrlToBytes(jwk.y)),
    );
  } catch {
    return null;
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export const getWebPushConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Only expose the public application-server key. Private VAPID material never
    // leaves the server process.
    return {
      supported: Boolean(vapidPublicKey()),
      publicKey: vapidPublicKey(),
    };
  });

export const registerWebPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SubscriptionSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: companyId, error: companyError } =
      await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");

    const db = context.supabase as any;
    const { error } = await db
      .from("web_push_subscriptions")
      .upsert(
        {
          user_id: context.userId,
          company_id: companyId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          expiration_time: data.expirationTime ?? null,
          user_agent: data.userAgent ?? null,
          device_label: data.deviceLabel ?? null,
          is_active: true,
          last_failure_at: null,
        },
        { onConflict: "endpoint" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const unregisterWebPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string().url().startsWith("https://").max(2048) }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("web_push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    if (error) throw error;
    return { ok: true };
  });
