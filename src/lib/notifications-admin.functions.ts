import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(db: any, userId: string) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Admin only");
}

async function assertVisibleParty(db: any, kind: "customer" | "vendor", id: string) {
  const table = kind === "customer" ? "parties" : "suppliers";
  const { data, error } = await db.from(table).select("id").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Record is not visible in the active company");
}

async function assertVisibleNotificationSource(db: any, refTable: string | null, refId: string | null) {
  if (!refTable || !refId) return;
  const allowed = new Set([
    "parties",
    "suppliers",
    "sales_orders",
    "purchase_bills",
    "invoices",
    "production_orders",
    "vouchers",
  ]);
  if (!allowed.has(refTable)) throw new Error("Notification source is not permitted for retry");
  const { data, error } = await db.from(refTable).select("id").eq("id", refId).maybeSingle();
  if (error || !data) throw new Error("Notification source is not visible in the active company");
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
export function renderBody(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => {
    const v = vars[k];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** Toggle marketing/promo opt-in for a party or supplier. */
export const setPromoOptIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        party_kind: z.enum(["customer", "vendor"]),
        party_id: z.string().uuid(),
        promo_opt_in: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    await assertVisibleParty(context.supabase, data.party_kind, data.party_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.party_kind === "customer" ? "parties" : "suppliers";
    const { error } = await supabaseAdmin
      .from(table)
      .update({ promo_opt_in: data.promo_opt_in })
      .eq("id", data.party_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** List all notification_log rows for a specific party/supplier, newest first. */
export const listPartyMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        party_kind: z.enum(["customer", "vendor"]),
        party_id: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    await assertVisibleParty(context.supabase, data.party_kind, data.party_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("notification_log")
      .select(
        "id, sent_at, channel, event_type, template_name, status, whatsapp_message_id, read_status, read_at, failure_reason, recipient_phone, payload",
      )
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
    await assertAdmin(context.supabase, context.userId);
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
    if (log.party_kind === "customer" || log.party_kind === "vendor") {
      if (!log.party_id) throw new Error("Notification has no party owner");
      await assertVisibleParty(context.supabase, log.party_kind, log.party_id);
    } else if (log.party_id) {
      const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
      if (companyError || !companyId) throw new Error("No active company selected");
      const { data: membership, error: membershipError } = await context.supabase
        .from("user_company_access")
        .select("user_id")
        .eq("user_id", log.party_id)
        .eq("company_id", companyId)
        .eq("can_view", true)
        .maybeSingle();
      if (membershipError || !membership) throw new Error("Notification recipient is not visible in the active company");
    } else {
      throw new Error("Notification has no visible recipient");
    }
    await assertVisibleNotificationSource(context.supabase, log.ref_table, log.ref_id);

    // Try to recover recipient phone if missing (from the party/supplier record)
    let to = normalizeWa(log.recipient_phone ?? null);
    if (!to && log.party_id) {
      const tbl =
        log.party_kind === "customer"
          ? "parties"
          : log.party_kind === "vendor"
            ? "suppliers"
            : null;
      if (tbl) {
        const { data: pr } = await supabaseAdmin
          .from(tbl)
          .select("phone, whatsapp_number")
          .eq("id", log.party_id)
          .maybeSingle();
        to = normalizeWa((pr as any)?.whatsapp_number ?? (pr as any)?.phone ?? null);
      }
    }

    const payload = (log.payload as Record<string, unknown> | null) ?? {};
    const variables =
      payload && typeof payload.variables === "object" && payload.variables !== null
        ? (payload.variables as Record<string, unknown>)
        : payload && typeof payload.vars === "object" && payload.vars !== null
          ? (payload.vars as Record<string, unknown>)
          : {};

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
        payload: { retry_of: log.id, variables },
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
        payload: { retry_of: log.id, variables },
      });
      return { ok: false, reason: "not_configured" };
    }

    // Retries are constrained to the same currently-active approved template.
    // Never replay arbitrary stored freeform content or caller-controlled payloads.
    let result:
      | { ok: true; messageId: string }
      | { ok: false; status: "failed" | "skipped"; error: string };
    let usedTemplate: string | null = null;

    if (!log.template_name) {
      throw new Error("This notification has no approved template and cannot be retried");
    }

    const { data: tpl } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("template_name, language_code, variables, is_active")
      .eq("template_name", log.template_name)
      .eq("is_active", true)
      .maybeSingle();

    if (!tpl) {
      throw new Error("The original WhatsApp template is no longer active");
    }

    const order: string[] = Array.isArray(tpl.variables) ? (tpl.variables as string[]) : [];
    const bodyValues = order.map((n) => {
      const value = variables[n];
      return value === null || value === undefined ? "" : String(value).slice(0, 500);
    });
    result = await provider.sendTemplate({
      to,
      templateName: tpl.template_name,
      languageCode: tpl.language_code ?? "en",
      bodyVariables: bodyValues,
    });
    usedTemplate = tpl.template_name;

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

// ---------- Notification Providers management ----------

export const listNotificationProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { listProviders } = await import("./notifications/registry.server");
    const providers = await listProviders();
    return { providers };
  });

const ProviderSchema = z.object({
  id: z.string().uuid().optional(),
  channel: z.enum(["whatsapp", "sms", "email", "push", "in_app"]),
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_]+$/i, "Letters, digits, underscores only"),
  display_name: z.string().min(1).max(200),
  is_active: z.boolean().default(false),
  is_default: z.boolean().default(false),
  priority: z.number().int().min(0).max(1000).default(100),
  config: z.record(z.string(), z.any()).default({}),
  secret_env_keys: z.array(z.string().min(1).max(80)).max(20).default([]),
  notes: z.string().max(1000).optional().nullable(),
});

export const upsertNotificationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProviderSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      channel: data.channel,
      name: data.name,
      display_name: data.display_name,
      is_active: data.is_active,
      is_default: data.is_default,
      priority: data.priority,
      config: data.config as any,
      secret_env_keys: data.secret_env_keys as any,
      notes: data.notes ?? null,
    };
    if (data.is_default) {
      await supabaseAdmin
        .from("notification_providers")
        .update({ is_default: false })
        .eq("channel", data.channel);
    }
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("notification_providers")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("notification_providers")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins.id };
  });

export const toggleNotificationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("notification_providers")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNotificationProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("notification_providers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
