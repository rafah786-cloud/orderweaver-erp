import type {
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
  WhatsAppFreeformMessage,
} from "./types";

const INTERAKT_BASE = "https://api.interakt.ai/v1/public";

function authHeader(): string | null {
  const key = process.env.INTERAKT_API_KEY;
  if (!key) return null;
  // Interakt uses Basic auth with the API key as username; no password.
  // Base64-encoded "API_KEY:" works for their REST API.
  const token = Buffer.from(`${key}:`).toString("base64");
  return `Basic ${token}`;
}

function normalizeE164(raw: string): { countryCode: string; phoneNumber: string } | null {
  const trimmed = raw.replace(/[\s\-()]/g, "");
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) return null;
  // crude split: assume 1-3 digit country code; Interakt expects countryCode and phoneNumber separately.
  // Default to +91 if unparseable into a known length.
  const digits = withPlus.slice(1);
  // 2-digit CC heuristic for India/most; fallback first 2.
  let cc = "91";
  let rest = digits;
  if (digits.startsWith("91") && digits.length === 12) {
    cc = "91";
    rest = digits.slice(2);
  } else if (digits.length > 10) {
    cc = digits.slice(0, digits.length - 10);
    rest = digits.slice(digits.length - 10);
  }
  return { countryCode: cc, phoneNumber: rest };
}

async function postJson(path: string, body: unknown): Promise<WhatsAppSendResult> {
  const auth = authHeader();
  if (!auth) {
    return { ok: false, status: "skipped", error: "INTERAKT_API_KEY not configured" };
  }
  try {
    const res = await fetch(`${INTERAKT_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.result === false) {
      return {
        ok: false,
        status: "failed",
        error: `Interakt ${res.status}: ${json?.message ?? json?.description ?? "send failed"}`,
        raw: json,
      };
    }
    const messageId: string =
      json?.id ?? json?.message_id ?? json?.data?.id ?? json?.data?.message_id ?? "";
    return { ok: true, messageId, raw: json };
  } catch (e) {
    return {
      ok: false,
      status: "failed",
      error: e instanceof Error ? e.message : "network error",
    };
  }
}

export const interaktProvider: WhatsAppProvider = {
  name: "interakt",
  isConfigured() {
    return Boolean(process.env.INTERAKT_API_KEY);
  },
  async sendTemplate(msg: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    const norm = normalizeE164(msg.to);
    if (!norm) return { ok: false, status: "skipped", error: "invalid phone" };
    return postJson("/message/", {
      countryCode: `+${norm.countryCode}`,
      phoneNumber: norm.phoneNumber,
      type: "Template",
      template: {
        name: msg.templateName,
        languageCode: msg.languageCode ?? "en",
        headerValues: msg.headerVariables ?? [],
        bodyValues: msg.bodyVariables ?? [],
        buttonValues: msg.buttonVariables ? { 0: msg.buttonVariables } : {},
      },
    });
  },
  async sendFreeform(msg: WhatsAppFreeformMessage): Promise<WhatsAppSendResult> {
    const norm = normalizeE164(msg.to);
    if (!norm) return { ok: false, status: "skipped", error: "invalid phone" };
    return postJson("/message/", {
      countryCode: `+${norm.countryCode}`,
      phoneNumber: norm.phoneNumber,
      type: "Text",
      data: { message: msg.body.slice(0, 1500) },
    });
  },
};
