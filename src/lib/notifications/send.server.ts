import type {
  FreeformMessage,
  NotificationChannel,
  SendResult,
  TemplateMessage,
} from "./types";
import { resolveProvider } from "./registry.server";

export type SendContext = {
  party_kind?: "customer" | "vendor" | "staff" | "admin";
  party_id?: string | null;
  event_type: string;
  ref_table?: string | null;
  ref_id?: string | null;
  payload?: Record<string, unknown> | null;
  idempotency_key?: string | null;
};

async function log(
  channel: NotificationChannel,
  to: string | null,
  templateName: string | null,
  ctx: SendContext,
  result: SendResult,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notification_log").insert({
    channel,
    recipient_phone: to,
    party_kind: ctx.party_kind ?? "customer",
    party_id: ctx.party_id ?? null,
    event_type: ctx.event_type,
    template_name: templateName,
    ref_table: ctx.ref_table ?? null,
    ref_id: ctx.ref_id ?? null,
    status: result.ok ? "sent" : result.status,
    whatsapp_message_id: result.ok ? result.messageId : null,
    failure_reason: result.ok ? null : result.error,
    error: result.ok ? null : result.error,
    payload: (ctx.payload ?? null) as any,
    idempotency_key: ctx.idempotency_key ?? null,
  });
}

/**
 * Send a templated notification through the active provider for `channel`.
 * Resolves the provider from the `notification_providers` config table and
 * writes a row to `notification_log` with the outcome.
 */
export async function sendNotification(
  channel: NotificationChannel,
  msg: TemplateMessage,
  ctx: SendContext,
): Promise<SendResult> {
  const provider = await resolveProvider(channel);
  if (!provider) {
    const r: SendResult = {
      ok: false,
      status: "skipped",
      error: `No active ${channel} provider configured`,
    };
    await log(channel, msg.to, msg.templateName, ctx, r);
    return r;
  }
  if (!provider.isConfigured()) {
    const r: SendResult = {
      ok: false,
      status: "skipped",
      error: `${provider.name} provider missing credentials`,
    };
    await log(channel, msg.to, msg.templateName, ctx, r);
    return r;
  }
  const result = await provider.sendTemplate(msg);
  await log(channel, msg.to, msg.templateName, ctx, result);
  return result;
}

/** Freeform variant — same routing, no template. */
export async function sendFreeformNotification(
  channel: NotificationChannel,
  msg: FreeformMessage,
  ctx: SendContext,
): Promise<SendResult> {
  const provider = await resolveProvider(channel);
  if (!provider) {
    const r: SendResult = {
      ok: false,
      status: "skipped",
      error: `No active ${channel} provider configured`,
    };
    await log(channel, msg.to, null, ctx, r);
    return r;
  }
  if (!provider.isConfigured()) {
    const r: SendResult = {
      ok: false,
      status: "skipped",
      error: `${provider.name} provider missing credentials`,
    };
    await log(channel, msg.to, null, ctx, r);
    return r;
  }
  const result = await provider.sendFreeform(msg);
  await log(channel, msg.to, null, ctx, result);
  return result;
}
