import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AllowedRole = "admin" | "sales" | "production" | "accountant" | "hr" | "vendor";

async function assertHasAnyRole(userId: string, roles: AllowedRole[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles as any);
  if (!data || data.length === 0) throw new Error("Forbidden");
}

function normalizeWa(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/[\s\-()]/g, "");
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : null;
}

/** Build a freeform fallback body used when no Interakt template is registered for an event. */
function fallbackBody(event: string, vars: Record<string, string | number | null | undefined>): string {
  const lines = Object.entries(vars)
    .filter(([, v]) => v !== null && v !== undefined && String(v).length > 0)
    .map(([k, v]) => `${k}: ${v}`);
  return [`Notification: ${event}`, ...lines].join("\n");
}

async function resolveTemplate(eventKey: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("template_name, language_code, variables, is_active")
    .eq("event_key", eventKey)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data;
}

async function sendForEvent(opts: {
  to: string;
  eventKey: string;
  vars: Record<string, string | number | null | undefined>;
}) {
  const { getWhatsAppProvider } = await import("./whatsapp/provider.server");
  const provider = await getWhatsAppProvider();
  if (!provider.isConfigured()) {
    return {
      ok: false as const,
      status: "skipped" as const,
      error: "WhatsApp provider not configured",
      template_name: null as string | null,
      messageId: "",
    };
  }
  const tpl = await resolveTemplate(opts.eventKey);
  if (tpl?.template_name) {
    const varNames = Array.isArray(tpl.variables) ? (tpl.variables as string[]) : [];
    const bodyValues = varNames.map((n) => String(opts.vars[n] ?? ""));
    const result = await provider.sendTemplate({
      to: opts.to,
      templateName: tpl.template_name,
      languageCode: tpl.language_code ?? "en",
      bodyVariables: bodyValues,
    });
    return result.ok
      ? { ok: true as const, messageId: result.messageId, template_name: tpl.template_name }
      : { ok: false as const, status: result.status, error: result.error, template_name: tpl.template_name, messageId: "" };
  }
  // No template registered — try freeform (Interakt requires open session window; will likely fail outside 24h)
  const result = await provider.sendFreeform({ to: opts.to, body: fallbackBody(opts.eventKey, opts.vars) });
  return result.ok
    ? { ok: true as const, messageId: result.messageId, template_name: null }
    : { ok: false as const, status: result.status, error: result.error, template_name: null, messageId: "" };
}

/** Sales/Admin → notify vendor about a new or updated purchase order */
export const notifyVendorPurchaseBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      bill_id: z.string().uuid(),
      event: z.enum(["created", "updated", "cancelled"]).default("created"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.userId, ["admin", "sales", "production"]);
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bill, error } = await supabaseAdmin
      .from("purchase_bills")
      .select("id, bill_number, bill_date, total_amount, supplier_id, suppliers(id, name, phone, whatsapp_number, whatsapp_opt_in)")
      .eq("id", data.bill_id)
      .maybeSingle();
    if (error || !bill) throw new Error("Bill not found");
    const sup: any = (bill as any).suppliers;
    const eventKey = `purchase_order.${data.event}`;
    if (!sup) {
      await logWhatsAppNotification({ party_kind: "vendor", event_type: eventKey, ref_table: "purchase_bills", ref_id: bill.id, status: "skipped", failure_reason: "no supplier" });
      return { ok: false, reason: "no_supplier" };
    }
    if (!sup.whatsapp_opt_in) {
      await logWhatsAppNotification({ party_kind: "vendor", party_id: sup.id, event_type: eventKey, ref_table: "purchase_bills", ref_id: bill.id, status: "skipped", failure_reason: "opted out" });
      return { ok: false, reason: "opt_out" };
    }
    const to = normalizeWa(sup.whatsapp_number ?? sup.phone);
    if (!to) {
      await logWhatsAppNotification({ party_kind: "vendor", party_id: sup.id, event_type: eventKey, ref_table: "purchase_bills", ref_id: bill.id, status: "skipped", failure_reason: "no phone" });
      return { ok: false, reason: "no_phone" };
    }
    const result = await sendForEvent({
      to,
      eventKey,
      vars: {
        vendor_name: sup.name,
        po_number: bill.bill_number,
        po_date: bill.bill_date,
        po_value: Number(bill.total_amount ?? 0).toFixed(2),
      },
    });
    await logWhatsAppNotification({
      party_kind: "vendor",
      party_id: sup.id,
      recipient_phone: to,
      event_type: eventKey,
      template_name: result.template_name,
      ref_table: "purchase_bills",
      ref_id: bill.id,
      status: result.ok ? "sent" : result.status,
      whatsapp_message_id: result.ok ? result.messageId : null,
      failure_reason: result.ok ? null : result.error,
      payload: { event: data.event },
    });
    return { ok: result.ok };
  });

/** Generic customer notification — uses templates resolved via event key. */
export const notifyCustomerEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      party_id: z.string().uuid(),
      event: z.enum([
        "sales_order.created",
        "production_order.ready",
        "invoice.issued",
        "invoice.paid",
        "payment.received",
        "dispatch.update",
        "ledger.statement_ready",
      ]),
      ref_table: z.string().optional(),
      ref_id: z.string().uuid().optional(),
      vars: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.userId, ["admin", "sales", "production", "accountant"]);
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: party } = await supabaseAdmin
      .from("parties")
      .select("id, name, phone, whatsapp_number, whatsapp_opt_in")
      .eq("id", data.party_id)
      .maybeSingle();
    if (!party) throw new Error("Party not found");
    if ((party as any).whatsapp_opt_in === false) {
      await logWhatsAppNotification({ party_kind: "customer", party_id: party.id, event_type: data.event, ref_table: data.ref_table ?? null, ref_id: data.ref_id ?? null, status: "skipped", failure_reason: "opted out" });
      return { ok: false, reason: "opt_out" };
    }
    const to = normalizeWa((party as any).whatsapp_number ?? party.phone);
    if (!to) {
      await logWhatsAppNotification({ party_kind: "customer", party_id: party.id, event_type: data.event, ref_table: data.ref_table ?? null, ref_id: data.ref_id ?? null, status: "skipped", failure_reason: "no phone" });
      return { ok: false, reason: "no_phone" };
    }
    const result = await sendForEvent({ to, eventKey: data.event, vars: { customer_name: party.name, ...data.vars } });
    await logWhatsAppNotification({
      party_kind: "customer",
      party_id: party.id,
      recipient_phone: to,
      event_type: data.event,
      template_name: result.template_name,
      ref_table: data.ref_table ?? null,
      ref_id: data.ref_id ?? null,
      status: result.ok ? "sent" : result.status,
      whatsapp_message_id: result.ok ? result.messageId : null,
      failure_reason: result.ok ? null : result.error,
      payload: { vars: data.vars },
    });
    return { ok: result.ok };
  });

/** Vendor → notify admin/purchase staff that a vendor acted on a PO */
export const notifyAdminPurchaseAck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      bill_id: z.string().uuid(),
      status: z.enum(["accepted", "rejected"]),
      note: z.string().max(500).optional(),
      expected_dispatch_date: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.userId, ["vendor", "admin"]);
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bill } = await supabaseAdmin
      .from("purchase_bills")
      .select("id, bill_number, total_amount, supplier_id, suppliers(name, user_id)")
      .eq("id", data.bill_id)
      .maybeSingle();
    if (!bill) throw new Error("Bill not found");
    const supUserId = (bill as any).suppliers?.user_id ?? null;
    const { data: adminRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!adminRow && supUserId !== context.userId) throw new Error("Forbidden");
    const vendorName = (bill as any).suppliers?.name ?? "Vendor";
    const eventKey = `purchase_order.${data.status}`;
    const { data: recipients } = await supabaseAdmin
      .from("profiles")
      .select("id, whatsapp_number, phone, whatsapp_opt_in, user_roles!inner(role)")
      .eq("whatsapp_opt_in", true)
      .in("user_roles.role", ["admin"]);
    const list = (recipients ?? []) as any[];
    if (list.length === 0) {
      await logWhatsAppNotification({ party_kind: "admin", event_type: eventKey, ref_table: "purchase_bills", ref_id: bill.id, status: "skipped", failure_reason: "no recipients" });
      return { ok: false, reason: "no_recipients" };
    }
    let sent = 0;
    for (const r of list) {
      const to = normalizeWa(r.whatsapp_number ?? r.phone);
      if (!to) continue;
      const result = await sendForEvent({
        to,
        eventKey,
        vars: {
          po_number: bill.bill_number,
          vendor_name: vendorName,
          amount: Number(bill.total_amount ?? 0).toFixed(2),
          expected_dispatch_date: data.expected_dispatch_date ?? "",
          note: data.note ?? "",
        },
      });
      await logWhatsAppNotification({
        party_kind: "admin",
        party_id: r.id,
        recipient_phone: to,
        event_type: eventKey,
        template_name: result.template_name,
        ref_table: "purchase_bills",
        ref_id: bill.id,
        status: result.ok ? "sent" : result.status,
        whatsapp_message_id: result.ok ? result.messageId : null,
        failure_reason: result.ok ? null : result.error,
        payload: { note: data.note },
      });
      if (result.ok) sent += 1;
    }
    return { ok: sent > 0, sent };
  });

export const getWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return {
      provider: (process.env.WHATSAPP_PROVIDER ?? "interakt"),
      configured: Boolean(process.env.INTERAKT_API_KEY),
      webhook_configured: Boolean(process.env.INTERAKT_WEBHOOK_SECRET),
    };
  });
