import type {
  FreeformMessage,
  NotificationProvider,
  ProviderFactory,
  ProviderRecord,
  SendResult,
  TemplateMessage,
} from "../types";

/**
 * In-App provider.
 * - `to` is the recipient `user_id` (uuid string).
 * - Stores the message in `in_app_notifications` for the user's inbox/bell.
 */
export const inAppFactory: ProviderFactory = (record: ProviderRecord): NotificationProvider => ({
  channel: record.channel,
  name: record.name,
  isConfigured() {
    return true;
  },
  async sendTemplate(msg: TemplateMessage): Promise<SendResult> {
    const body = renderTemplate(msg);
    return insert(msg.to, msg.templateName, body, msg.variables);
  },
  async sendFreeform(msg: FreeformMessage): Promise<SendResult> {
    return insert(msg.to, msg.subject ?? "Notification", msg.body, null);
  },
});

function renderTemplate(msg: TemplateMessage): string {
  const parts: string[] = [];
  if (msg.variables) {
    for (const [k, v] of Object.entries(msg.variables)) {
      if (v == null || v === "") continue;
      parts.push(`${humanize(k)}: ${String(v)}`);
    }
  }
  return parts.length ? parts.join("\n") : msg.templateName;
}

function humanize(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function insert(
  userId: string,
  title: string,
  body: string,
  payload: Record<string, unknown> | null | undefined,
): Promise<SendResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("in_app_notifications")
      .insert({ user_id: userId, title, body, payload: (payload ?? null) as any })
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, status: "failed", error: error.message };
    return { ok: true, messageId: data?.id ?? "in_app" };
  } catch (e: any) {
    return { ok: false, status: "failed", error: e?.message ?? "in_app insert failed" };
  }
}
