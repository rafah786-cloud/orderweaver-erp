import type {
  NotificationProvider,
  ProviderFactory,
  ProviderRecord,
  SendResult,
  TemplateMessage,
  FreeformMessage,
} from "../types";

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

export const interaktFactory: ProviderFactory = (record: ProviderRecord): NotificationProvider => {
  const baseUrl =
    (record.config?.base_url as string | undefined) ?? "https://api.interakt.ai/v1/public";
  const defaultLang = (record.config?.default_language as string | undefined) ?? "en";

  function authHeader(): string | null {
    const key = process.env.INTERAKT_API_KEY;
    if (!key) return null;
    const token = Buffer.from(`${key}:`).toString("base64");
    return `Basic ${token}`;
  }

  async function postJson(path: string, body: unknown): Promise<SendResult> {
    const auth = authHeader();
    if (!auth) return { ok: false, status: "skipped", error: "INTERAKT_API_KEY not configured" };
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
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

  return {
    channel: "whatsapp",
    name: record.name,
    isConfigured() {
      return Boolean(process.env.INTERAKT_API_KEY);
    },
    async sendTemplate(msg: TemplateMessage): Promise<SendResult> {
      const norm = normalizeE164(msg.to);
      if (!norm) return { ok: false, status: "skipped", error: "invalid phone" };
      const bodyValues =
        msg.bodyVariables ??
        (msg.variables ? Object.values(msg.variables).map((v) => String(v ?? "")) : []);
      return postJson("/message/", {
        countryCode: `+${norm.countryCode}`,
        phoneNumber: norm.phoneNumber,
        type: "Template",
        template: {
          name: msg.templateName,
          languageCode: msg.languageCode ?? defaultLang,
          headerValues: [],
          bodyValues,
          buttonValues: {},
        },
      });
    },
    async sendFreeform(msg: FreeformMessage): Promise<SendResult> {
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
};
