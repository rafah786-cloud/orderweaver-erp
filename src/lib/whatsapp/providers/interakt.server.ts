import type {
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
  WhatsAppFreeformMessage,
} from "./types";

const DEFAULT_BASE = "https://api.interakt.ai/v1/public";
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [300, 800, 2000]; // backoff between attempts

function getBaseUrl(): string {
  return process.env.INTERAKT_BASE_URL || DEFAULT_BASE;
}

function authHeader(): string | null {
  const key = process.env.INTERAKT_API_KEY;
  if (!key) return null;
  // Interakt uses Basic auth with the API key as username; no password.
  const token = Buffer.from(`${key}:`).toString("base64");
  return `Basic ${token}`;
}

function normalizeE164(raw: string): { countryCode: string; phoneNumber: string } | null {
  const trimmed = raw.replace(/[\s\-()]/g, "");
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) return null;
  const digits = withPlus.slice(1);
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

function shouldRetry(status: number): boolean {
  // Retry on 429 + 5xx; never retry on 4xx (auth/validation errors)
  return status === 429 || (status >= 500 && status < 600);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postJson(path: string, body: unknown): Promise<WhatsAppSendResult> {
  const auth = authHeader();
  if (!auth) {
    return {
      ok: false,
      status: "skipped",
      error: "INTERAKT_API_KEY not configured",
      request: body,
    };
  }
  const url = `${getBaseUrl()}${path}`;
  let lastError = "send failed";
  let lastStatus = 0;
  let lastRaw: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      lastStatus = res.status;
      const json: any = await res.json().catch(() => ({}));
      lastRaw = json;
      if (res.ok && json?.result !== false) {
        const messageId: string =
          json?.id ?? json?.message_id ?? json?.data?.id ?? json?.data?.message_id ?? "";
        return { ok: true, messageId, attempts: attempt, request: body, raw: json };
      }
      lastError = `Interakt ${res.status}: ${json?.message ?? json?.description ?? "send failed"}`;
      if (!shouldRetry(res.status)) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "network error";
      // network errors are retryable
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1000);
  }
  return {
    ok: false,
    status: "failed",
    error: lastError,
    attempts: MAX_ATTEMPTS,
    request: body,
    raw: lastRaw,
  };
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
