import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin only");
}

function normalizeWa(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw.replace(/[\s\-()]/g, "");
  if (!t.startsWith("+")) {
    if (/^[6-9]\d{9}$/.test(t)) t = `+91${t}`;
    else t = `+${t}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(t) ? t : null;
}

/** Render "{{var}}" placeholders. Shared with client preview via render-body.ts. */
export function renderBody(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** Toggle marketing/promo opt-in for a party or supplier. */
export const setPromoOptIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      kind: z.enum(["party", "supplier"]),
      value: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.kind === "party" ? "parties" : "suppliers";
    const { error } = await supabaseAdmin.from(table).update({ promo_opt_in: data.value }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** List all notification_log rows for a specific party/supplier, newest first. */
export const listPartyMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      party_kind: z.enum(["customer", "vendor"]),
      party_id: z.string().uuid(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("notification_log")
      .select("id, sent_at, channel, event_type, template_name, status, whatsapp_message_id, read_status, read_at, failure_reason, recipient_phone, payload")
      .eq("party_kind", data.party_kind)
      .eq("party_id", data.party_id)
      .order("sent_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

/** Resend a previously failed/skipped WhatsApp message using its original payload. */
export const retryNotificationLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    const { getWhatsAppProvider } = await import("./whatsapp/provider.server");

    const { data: log } = await supabaseAdmin
      .from("notification_log")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!log) throw new Error("Log not found");
    if (log.channel !== "whatsapp") throw new Error("Only WhatsApp messages can be retried here");

    // Try to recover recipient phone if missing (from the party/supplier record)
    let to = normalizeWa(log.recipient_phone ?? null);
    if (!to && log.party_id) {
      const tbl = log.party_kind === "customer" ? "parties" : log.party_kind === "vendor" ? "suppliers" : null;
      if (tbl) {
        const { data: pr } = await supabaseAdmin.from(tbl).select("phone, whatsapp_number").eq("id", log.party_id).maybeSingle();
        to = normalizeWa((pr as any)?.whatsapp_number ?? (pr as any)?.phone ?? null);
      }
    }

    const payload = (log.payload as Record<string, unknown> | null) ?? {};
    const variables = (payload as any).variables ?? (payload as any).vars ?? {};
    const message: string | undefined = (payload as any).message;

    if (!to) {
      await logWhatsAppNotification({
        party_kind: log.party_kind as any,
        party_id: log.party_id,
        event_type: log.event_type,
        template_name: log.template_name,
        ref_table: log.ref_table,
        ref_id: log.ref_id,
        status: "skipped",
        failure_reason: "no phone (retry)",
        payload: { retry_of: log.id, variables, message },
      });
      return { ok: false, reason: "no_phone" };
    }

    const provider = await getWhatsAppProvider();
    if (!provider.isConfigured()) {
      await logWhatsAppNotification({
        party_kind: log.party_kind as any,
        party_id: log.party_id,
        recipient_phone: to,
        event_type: log.event_type,
        template_name: log.template_name,
        ref_table: log.ref_table,
        ref_id: log.ref_id,
        status: "skipped",
        failure_reason: "provider not configured (retry)",
        payload: { retry_of: log.id, variables, message },
      });
      return { ok: false, reason: "not_configured" };
    }

    // Prefer the same template row; fall back to freeform with body_template.
    let result: { ok: true; messageId: string } | { ok: false; status: "failed" | "skipped"; error: string };
    let usedTemplate: string | null = log.template_name;

    if (log.template_name) {
      const { data: tpl } = await supabaseAdmin
        .from("whatsapp_templates")
        .select("template_name, language_code, variables, body_template, is_active")
        .eq("template_name", log.template_name)
        .maybeSingle();
      if (tpl && tpl.is_active) {
        const order: string[] = Array.isArray(tpl.variables) ? (tpl.variables as string[]) : [];
        const bodyValues = order.map((n) => String((variables as any)[n] ?? ""));
        result = await provider.sendTemplate({
          to,
          templateName: tpl.template_name,
          languageCode: tpl.language_code ?? "en",
          bodyVariables: bodyValues,
        });
      } else if (tpl?.body_template) {
        result = await provider.sendFreeform({ to, body: renderBody(tpl.body_template, variables as any) });
        usedTemplate = null;
      } else {
        const body = message ?? Object.values(variables as any).map((v) => String(v ?? "")).join(" ").trim();
        result = await provider.sendFreeform({ to, body: body || "(no content)" });
        usedTemplate = null;
      }
    } else {
      const body = message ?? Object.values(variables as any).map((v) => String(v ?? "")).join(" ").trim();
      result = await provider.sendFreeform({ to, body: body || "(no content)" });
    }

    await logWhatsAppNotification({
      party_kind: log.party_kind as any,
      party_id: log.party_id,
      recipient_phone: to,
      event_type: log.event_type,
      template_name: usedTemplate,
      ref_table: log.ref_table,
      ref_id: log.ref_id,
      status: result.ok ? "sent" : result.status,
      whatsapp_message_id: result.ok ? result.messageId : null,
      failure_reason: result.ok ? null : result.error,
      payload: { retry_of: log.id, variables, message },
    });

    return result.ok
      ? { ok: true, messageId: result.messageId }
      : { ok: false, reason: result.error };
  });
