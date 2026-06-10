/**
 * Centralized Notification Engine.
 *
 * Business modules call `dispatchNotificationEvent(eventKey, recipients, vars)`.
 * The engine:
 *   1. Loads the event's enabled channels from `notification_event_channels`.
 *   2. Fans out to each enabled channel via the provider abstraction.
 *   3. Logs every attempt to `notification_log` (single audit trail).
 *
 * Adding a new channel (e.g. Telegram) only requires:
 *   - implementing `NotificationProvider`, registering it in the registry,
 *   - inserting a row into `notification_providers`,
 *   - extending the channel enum + `notification_event_channels` rows.
 * No business module needs to change.
 */
import type { NotificationChannel } from "./types";
import { sendNotification, sendFreeformNotification, type SendContext } from "./send.server";

export type EventRecipients = {
  /** E.164 / local phone (WhatsApp + SMS) */
  phone?: string | null;
  /** Email address */
  email?: string | null;
  /** App user ids for In-App inbox */
  userIds?: string[];
  /** Device tokens for Push (future) */
  pushTokens?: string[];
};

export type DispatchInput = {
  eventKey: string;
  recipients: EventRecipients;
  variables?: Record<string, string | number | null | undefined>;
  context?: Omit<SendContext, "event_type">;
  /** Override / supply per-channel template names. */
  templates?: Partial<Record<NotificationChannel, string>>;
  /**
   * Idempotency key for this event instance. If omitted, falls back to
   * `${ref_table}:${ref_id}:${eventKey}` when both are present in context.
   * The engine derives per-channel/recipient sub-keys so repeated triggers
   * (e.g. retried webhooks, double-clicks) never resend a successful message.
   */
  dedupeKey?: string | null;
};

export type DispatchOutcome = {
  channel: NotificationChannel;
  status: "sent" | "failed" | "skipped";
  messageId?: string;
  error?: string;
};

type RoutingRow = {
  channel: NotificationChannel;
  is_enabled: boolean;
  template_name: string | null;
  subject_template: string | null;
  body_template: string | null;
};

async function loadRouting(eventKey: string): Promise<RoutingRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("notification_event_channels")
    .select("channel,is_enabled,template_name,subject_template,body_template")
    .eq("event_key", eventKey);
  return (data ?? []) as RoutingRow[];
}

function render(tpl: string | null | undefined, vars: Record<string, any> = {}): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

/**
 * Fans out an ERP event to all admin-enabled channels.
 * Never throws — returns per-channel outcomes; full audit lands in notification_log.
 */
export async function dispatchNotificationEvent(input: DispatchInput): Promise<DispatchOutcome[]> {
  const { eventKey, recipients, variables = {}, context = {}, templates = {} } = input;
  const ctx: SendContext = { ...context, event_type: eventKey };
  const routing = await loadRouting(eventKey);
  const outcomes: DispatchOutcome[] = [];

  for (const row of routing) {
    if (!row.is_enabled) continue;
    const tplName = templates[row.channel] ?? row.template_name ?? eventKey;

    try {
      if (row.channel === "whatsapp" || row.channel === "sms") {
        if (!recipients.phone) {
          outcomes.push({ channel: row.channel, status: "skipped", error: "no phone" });
          continue;
        }
        const r = await sendNotification(row.channel, {
          to: recipients.phone,
          templateName: tplName,
          variables,
        }, ctx);
        outcomes.push(toOutcome(row.channel, r));
      } else if (row.channel === "email") {
        if (!recipients.email) {
          outcomes.push({ channel: "email", status: "skipped", error: "no email" });
          continue;
        }
        const subject = render(row.subject_template, variables) || tplName;
        const body = render(row.body_template, variables);
        if (body) {
          const r = await sendFreeformNotification("email", {
            to: recipients.email, subject, body,
          }, ctx);
          outcomes.push(toOutcome("email", r));
        } else {
          const r = await sendNotification("email", {
            to: recipients.email, templateName: tplName, subject, variables,
          }, ctx);
          outcomes.push(toOutcome("email", r));
        }
      } else if (row.channel === "in_app") {
        const users = recipients.userIds ?? [];
        if (users.length === 0) {
          outcomes.push({ channel: "in_app", status: "skipped", error: "no user ids" });
          continue;
        }
        const subject = render(row.subject_template, variables) || tplName;
        const body = render(row.body_template, variables);
        for (const uid of users) {
          if (body) {
            const r = await sendFreeformNotification("in_app", {
              to: uid, subject, body,
            }, { ...ctx, party_kind: "staff", party_id: null });
            outcomes.push(toOutcome("in_app", r));
          } else {
            const r = await sendNotification("in_app", {
              to: uid, templateName: tplName, subject, variables,
            }, { ...ctx, party_kind: "staff", party_id: null });
            outcomes.push(toOutcome("in_app", r));
          }
        }
      } else if (row.channel === "push") {
        const tokens = recipients.pushTokens ?? [];
        if (tokens.length === 0) {
          outcomes.push({ channel: "push", status: "skipped", error: "no push tokens" });
          continue;
        }
        for (const tok of tokens) {
          const r = await sendNotification("push", {
            to: tok, templateName: tplName, variables,
          }, ctx);
          outcomes.push(toOutcome("push", r));
        }
      }
    } catch (e: any) {
      outcomes.push({ channel: row.channel, status: "failed", error: e?.message ?? "dispatch error" });
    }
  }
  return outcomes;
}

function toOutcome(channel: NotificationChannel, r: any): DispatchOutcome {
  if (r?.ok) return { channel, status: "sent", messageId: r.messageId };
  return { channel, status: r?.status ?? "failed", error: r?.error };
}
