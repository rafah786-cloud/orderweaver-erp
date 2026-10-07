import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AllowedRole = "admin" | "sales" | "production" | "accountant" | "hr" | "vendor";
const APP_ORIGIN = "https://orderweaver-erp.lovable.app";

async function assertHasAnyRole(db: any, userId: string, roles: AllowedRole[]) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles as any);
  if (error || !data || data.length === 0) throw new Error("Forbidden");
}

function normalizeWa(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/[\s\-()]/g, "");
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : null;
}

/** Resolve the active approved WhatsApp template for an event. */
async function resolveTemplate(db: any, eventKey: string) {
  const { data } = await db
    .from("whatsapp_templates")
    .select("template_name, language_code, variables, is_active")
    .eq("event_key", eventKey)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data;
}

async function resolveCustomerEventReference(
  db: any,
  event: string,
  refId: string,
  partyId: string,
): Promise<{ table: string; vars: Record<string, string | number> }> {
  if (event === "sales_order.created") {
    const { data } = await db
      .from("sales_orders")
      .select("id, party_id, order_number, total_amount")
      .eq("id", refId)
      .eq("party_id", partyId)
      .maybeSingle();
    if (!data) throw new Error("Sales order does not belong to this customer");
    return {
      table: "sales_orders",
      vars: { order_no: data.order_number, order_value: Number(data.total_amount).toFixed(2) },
    };
  }
  if (event === "production_order.ready" || event === "dispatch.update") {
    const { data } = await db
      .from("production_orders")
      .select(
        "id, production_number, tracking_number, transporter_name, sales_orders!inner(order_number, party_id)",
      )
      .eq("id", refId)
      .eq("sales_orders.party_id", partyId)
      .maybeSingle();
    if (!data) throw new Error("Production order does not belong to this customer");
    const order = Array.isArray(data.sales_orders) ? data.sales_orders[0] : data.sales_orders;
    return {
      table: "production_orders",
      vars: {
        order_no: order?.order_number ?? data.production_number,
        tracking_no: data.tracking_number ?? "",
        transporter_name: data.transporter_name ?? "",
      },
    };
  }
  if (event === "invoice.issued" || event === "invoice.paid") {
    const { data } = await db
      .from("invoices")
      .select("id, party_id, invoice_number, total_amount, paid_amount, due_date")
      .eq("id", refId)
      .eq("party_id", partyId)
      .maybeSingle();
    if (!data) throw new Error("Invoice does not belong to this customer");
    return {
      table: "invoices",
      vars: {
        invoice_no: data.invoice_number,
        invoice_amount: Number(data.total_amount).toFixed(2),
        payment_amount: Number(data.paid_amount).toFixed(2),
        due_date: data.due_date ?? "",
        invoice_url: `${APP_ORIGIN}/print/invoice/${data.id}`,
      },
    };
  }
  if (event === "payment.received") {
    const { data } = await db
      .from("vouchers")
      .select(
        "id, voucher_number, voucher_entries!inner(credit, ledger_accounts!inner(mapped_party_id))",
      )
      .eq("id", refId)
      .eq("voucher_entries.ledger_accounts.mapped_party_id", partyId)
      .maybeSingle();
    if (!data) throw new Error("Receipt does not belong to this customer");
    const entries = (data.voucher_entries ?? []) as Array<{ credit: number }>;
    return {
      table: "vouchers",
      vars: {
        receipt_no: data.voucher_number,
        payment_amount: entries.reduce((sum, row) => sum + Number(row.credit ?? 0), 0).toFixed(2),
      },
    };
  }
  if (event === "ledger.statement_ready") {
    const { data } = await db
      .from("parties")
      .select("id, current_balance")
      .eq("id", refId)
      .eq("id", partyId)
      .maybeSingle();
    if (!data) throw new Error("Statement does not belong to this customer");
    return {
      table: "parties",
      vars: { closing_balance: Number(data.current_balance ?? 0).toFixed(2) },
    };
  }
  throw new Error("Unsupported customer notification");
}

async function sendForEvent(opts: {
  db: any;
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
  const tpl = await resolveTemplate(opts.db, opts.eventKey);
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
      : {
          ok: false as const,
          status: result.status,
          error: result.error,
          template_name: tpl.template_name,
          messageId: "",
        };
  }
  return {
    ok: false as const,
    status: "skipped" as const,
    error: "No approved WhatsApp template is active",
    template_name: null as string | null,
    messageId: "",
  };
}

/** Sales/Admin → notify vendor about a new or updated purchase order */
export const notifyVendorPurchaseBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        bill_id: z.string().uuid(),
        event: z.enum(["created", "updated", "cancelled"]).default("created"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "sales", "production"]);
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    // Resolve the bill and joined supplier as the caller; existing RLS is authoritative.
    const { data: bill, error } = await context.supabase
      .from("purchase_bills")
      .select(
        "id, bill_number, bill_date, total_amount, supplier_id, suppliers(id, user_id, name, phone, whatsapp_number, whatsapp_opt_in)",
      )
      .eq("id", data.bill_id)
      .maybeSingle();
    if (error || !bill) throw new Error("Bill not found");
    const sup: any = (bill as any).suppliers;
    const eventKey = `purchase_order.${data.event}`;
    if (!sup) {
      await logWhatsAppNotification({
        party_kind: "vendor",
        event_type: eventKey,
        ref_table: "purchase_bills",
        ref_id: bill.id,
        status: "skipped",
        failure_reason: "no supplier",
      });
      return { ok: false, reason: "no_supplier" };
    }
    if (!sup.whatsapp_opt_in) {
      await logWhatsAppNotification({
        party_kind: "vendor",
        party_id: sup.id,
        event_type: eventKey,
        ref_table: "purchase_bills",
        ref_id: bill.id,
        status: "skipped",
        failure_reason: "opted out",
      });
      return { ok: false, reason: "opt_out" };
    }
    const to = normalizeWa(sup.whatsapp_number ?? sup.phone);
    if (!to) {
      await logWhatsAppNotification({
        party_kind: "vendor",
        party_id: sup.id,
        event_type: eventKey,
        ref_table: "purchase_bills",
        ref_id: bill.id,
        status: "skipped",
        failure_reason: "no phone",
      });
      return { ok: false, reason: "no_phone" };
    }
    const po_url = `${APP_ORIGIN}/print/purchase/${bill.id}`;

    if (sup.user_id) {
      const { dispatchNotificationEvent } = await import("./notifications/engine.server");
      await dispatchNotificationEvent({
        eventKey,
        recipients: { userIds: [sup.user_id] },
        variables: {
          vendor_name: sup.name,
          po_number: bill.bill_number,
          po_date: bill.bill_date,
          po_value: Number(bill.total_amount ?? 0).toFixed(2),
          po_url,
        },
        context: {
          party_kind: "vendor",
          party_id: sup.id,
          ref_table: "purchase_bills",
          ref_id: bill.id,
          payload: { source: "vendor-notification" },
        },
      });
    }

    const result = await sendForEvent({
      db: context.supabase,
      to,
      eventKey,
      vars: {
        vendor_name: sup.name,
        po_number: bill.bill_number,
        po_date: bill.bill_date,
        po_value: Number(bill.total_amount ?? 0).toFixed(2),
        po_url,
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
    z
      .object({
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
        ref_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [
      "admin",
      "sales",
      "production",
      "accountant",
    ]);
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    const reference = await resolveCustomerEventReference(
      context.supabase,
      data.event,
      data.ref_id,
      data.party_id,
    );
    const { data: party, error: partyError } = await context.supabase
      .from("parties")
      .select("id, user_id, name, phone, whatsapp_number, whatsapp_opt_in")
      .eq("id", data.party_id)
      .maybeSingle();
    if (partyError || !party) throw new Error("Party not found");
    // Transactional customer alerts are account-aware. WhatsApp opt-out does
    // not suppress the separate ERP push channel.
    if ((party as any).user_id) {
      const { dispatchNotificationEvent } = await import("./notifications/engine.server");
      await dispatchNotificationEvent({
        eventKey: data.event,
        recipients: { userIds: [(party as any).user_id] },
        variables: { customer_name: party.name, ...reference.vars },
        context: {
          party_kind: "customer",
          party_id: party.id,
          ref_table: reference.table,
          ref_id: data.ref_id,
          payload: { source: "customer-notification" },
        },
      });
    }

    if ((party as any).whatsapp_opt_in === false) {
      await logWhatsAppNotification({
        party_kind: "customer",
        party_id: party.id,
        event_type: data.event,
        ref_table: reference.table,
        ref_id: data.ref_id,
        status: "skipped",
        failure_reason: "opted out",
      });
      return { ok: false, reason: "opt_out" };
    }
    const to = normalizeWa((party as any).whatsapp_number ?? party.phone);
    if (!to) {
      await logWhatsAppNotification({
        party_kind: "customer",
        party_id: party.id,
        event_type: data.event,
        ref_table: reference.table,
        ref_id: data.ref_id,
        status: "skipped",
        failure_reason: "no phone",
      });
      return { ok: false, reason: "no_phone" };
    }
    const result = await sendForEvent({
      db: context.supabase,
      to,
      eventKey: data.event,
      vars: { customer_name: party.name, ...reference.vars },
    });
    await logWhatsAppNotification({
      party_kind: "customer",
      party_id: party.id,
      recipient_phone: to,
      event_type: data.event,
      template_name: result.template_name,
      ref_table: reference.table,
      ref_id: data.ref_id,
      status: result.ok ? "sent" : result.status,
      whatsapp_message_id: result.ok ? result.messageId : null,
      failure_reason: result.ok ? null : result.error,
      payload: { source: reference.table },
    });
    return { ok: result.ok };
  });

/** Vendor → notify admin/purchase staff that a vendor acted on a PO */
export const notifyAdminPurchaseAck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        bill_id: z.string().uuid(),
        status: z.enum(["accepted", "rejected"]),
        note: z.string().max(500).optional(),
        expected_dispatch_date: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["vendor", "admin"]);
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    const { data: bill, error: billError } = await context.supabase
      .from("purchase_bills")
      .select("id, bill_number, total_amount, supplier_id, suppliers(name, user_id)")
      .eq("id", data.bill_id)
      .maybeSingle();
    if (billError || !bill) throw new Error("Bill not found");
    const supUserId = (bill as any).suppliers?.user_id ?? null;
    const { data: adminRow, error: adminError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminError) throw new Error("Forbidden");
    if (!adminRow && supUserId !== context.userId) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const vendorName = (bill as any).suppliers?.name ?? "Vendor";
    const eventKey = `purchase_order.${data.status}`;
    const { data: activeCompanyId, error: companyError } =
      await context.supabase.rpc("current_company_id");
    if (companyError || !activeCompanyId) throw new Error("No active company selected");
    const { data: memberRows } = await supabaseAdmin
      .from("user_company_access")
      .select("user_id")
      .eq("company_id", activeCompanyId)
      .eq("can_view", true);
    const memberIds = Array.from(new Set((memberRows ?? []).map((r) => r.user_id)));
    const { data: recipients } = memberIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, whatsapp_number, phone, whatsapp_opt_in, user_roles!inner(role)")
          .in("id", memberIds)
          .eq("whatsapp_opt_in", true)
          .in("user_roles.role", ["admin"])
      : { data: [] };
    const list = (recipients ?? []) as any[];
    if (list.length === 0) {
      await logWhatsAppNotification({
        party_kind: "admin",
        event_type: eventKey,
        ref_table: "purchase_bills",
        ref_id: bill.id,
        status: "skipped",
        failure_reason: "no recipients",
      });
      return { ok: false, reason: "no_recipients" };
    }
    let sent = 0;
    for (const r of list) {
      const to = normalizeWa(r.whatsapp_number ?? r.phone);
      if (!to) continue;
      const result = await sendForEvent({
        db: context.supabase,
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
  .handler(async ({ context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin"]);
    return {
      provider: process.env.WHATSAPP_PROVIDER ?? "interakt",
      configured: Boolean(process.env.INTERAKT_API_KEY),
      webhook_configured: Boolean(process.env.INTERAKT_WEBHOOK_SECRET),
    };
  });
