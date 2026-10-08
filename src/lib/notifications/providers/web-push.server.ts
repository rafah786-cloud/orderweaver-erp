import type {
  FreeformMessage,
  NotificationProvider,
  ProviderFactory,
  ProviderRecord,
  SendResult,
  TemplateMessage,
} from "../types";

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u32be(value: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

async function hmac(keyBytes: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function hkdfExpand(prk: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const output: Uint8Array[] = [];
  let previous = new Uint8Array();
  for (let i = 1; output.reduce((n, p) => n + p.length, 0) < length; i++) {
    previous = await hmac(prk, concat(previous, info, new Uint8Array([i])));
    output.push(previous);
  }
  return concat(...output).slice(0, length);
}

async function encryptWebPushPayload(
  subscription: StoredSubscription,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);

  const senderKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const receiverPublic = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: receiverPublic },
      senderKeys.privateKey,
      256,
    ),
  );

  const prkKey = await hmac(authSecret, sharedSecret);
  const keyInfo = concat(
    new TextEncoder().encode("WebPush: info"),
    new Uint8Array([0]),
    uaPublic,
    senderPublic,
  );
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = await hkdfExpand(
    prk,
    concat(new TextEncoder().encode("Content-Encoding: aes128gcm"), new Uint8Array([0])),
    16,
  );
  const nonce = await hkdfExpand(
    prk,
    concat(new TextEncoder().encode("Content-Encoding: nonce"), new Uint8Array([0])),
    12,
  );

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concat(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded),
  );

  // RFC 8291 aes128gcm content coding: salt || record size || key-id length || sender public key || ciphertext.
  return concat(salt, u32be(4096), new Uint8Array([senderPublic.length]), senderPublic, ciphertext);
}

function parsePrivateVapidJwk(): JsonWebKey | null {
  const raw = process.env.WEB_PUSH_VAPID_PRIVATE_JWK?.trim();
  if (!raw) return null;
  try {
    const jwk = JSON.parse(raw);
    if (jwk?.kty !== "EC" || jwk?.crv !== "P-256" || !jwk?.d || !jwk?.x || !jwk?.y) return null;
    return jwk;
  } catch {
    return null;
  }
}

function vapidPublicKey(jwk: JsonWebKey): string {
  const x = String(jwk.x);
  const y = String(jwk.y);
  return bytesToBase64Url(concat(new Uint8Array([4]), base64UrlToBytes(x), base64UrlToBytes(y)));
}

async function createVapidJwt(endpoint: string, jwk: JsonWebKey): Promise<string> {
  const aud = new URL(endpoint).origin;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();
  if (!subject) throw new Error("Web Push VAPID subject is not configured");

  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const payload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signingInput),
  );
  if (signature.length !== 64) throw new Error("Unexpected VAPID signature format");
  return `${header}.${payload}.${bytesToBase64Url(signature)}`;
}

function configured(): boolean {
  const jwk = parsePrivateVapidJwk();
  return Boolean(jwk && process.env.WEB_PUSH_VAPID_SUBJECT);
}

async function send(subscription: StoredSubscription, body: Record<string, unknown>): Promise<SendResult> {
  if (!configured()) {
    return { ok: false, status: "skipped", error: "Web Push VAPID credentials are not configured" };
  }

  try {
    const jwk = parsePrivateVapidJwk();
    if (!jwk) throw new Error("Invalid Web Push VAPID private JWK");
    const payload = new TextEncoder().encode(JSON.stringify(body));
    if (payload.length > 3900) throw new Error("Web Push payload is too large");

    const encrypted = await encryptWebPushPayload(subscription, payload);
    const jwt = await createVapidJwt(subscription.endpoint, jwk);
    const publicKey = vapidPublicKey(jwk);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${publicKey}`,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "300",
        Urgency: "normal",
      },
      body: encrypted as BodyInit,
    });

    if (response.status === 404 || response.status === 410) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any)
        .from("web_push_subscriptions")
        .update({ is_active: false, last_failure_at: new Date().toISOString() })
        .eq("id", subscription.id);
      return { ok: false, status: "failed", error: "Push subscription is no longer valid" };
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any)
        .from("web_push_subscriptions")
        .update({ last_failure_at: new Date().toISOString() })
        .eq("id", subscription.id);
      return { ok: false, status: "failed", error: `Push service returned HTTP ${response.status}: ${detail}` };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("web_push_subscriptions")
      .update({ is_active: true, last_success_at: new Date().toISOString(), last_failure_at: null })
      .eq("id", subscription.id);

    return {
      ok: true,
      messageId: response.headers.get("location") ?? subscription.id,
    };
  } catch (error: any) {
    return { ok: false, status: "failed", error: error?.message ?? "Web Push delivery failed" };
  }
}

function renderBody(msg: TemplateMessage | FreeformMessage): { title: string; body: string } {
  if ("templateName" in msg) {
    const body = Object.entries(msg.variables ?? {})
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`)
      .join("\n");
    return { title: msg.subject ?? msg.templateName, body: body || msg.templateName };
  }
  return { title: msg.subject ?? "Mattress Maestro", body: msg.body };
}

export const webPushFactory: ProviderFactory = (record: ProviderRecord): NotificationProvider => ({
  channel: record.channel,
  name: record.name,
  isConfigured: configured,
  async sendTemplate(msg: TemplateMessage): Promise<SendResult> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: subscription, error } = await db
      .from("web_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("id", msg.to)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !subscription) {
      return { ok: false, status: "skipped", error: "No active Web Push subscription" };
    }
    const rendered = renderBody(msg);
    return send(subscription as StoredSubscription, {
      title: rendered.title,
      body: rendered.body,
      eventKey: msg.templateName,
      icon: "/zizz-logo-180.png",
      badge: "/zizz-logo-180.png",
      url: "/communications/inbox",
    });
  },
  async sendFreeform(msg: FreeformMessage): Promise<SendResult> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subscription, error } = await (supabaseAdmin as any)
      .from("web_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("id", msg.to)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !subscription) {
      return { ok: false, status: "skipped", error: "No active Web Push subscription" };
    }
    const rendered = renderBody(msg);
    return send(subscription as StoredSubscription, {
      title: rendered.title,
      body: rendered.body,
      icon: "/zizz-logo-180.png",
      badge: "/zizz-logo-180.png",
      url: "/communications/inbox",
    });
  },
});
