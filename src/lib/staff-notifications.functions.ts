import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AllowedRole = "admin" | "sales" | "production" | "accountant" | "hr";

export const DEPARTMENTS = ["Sales", "Accounts", "Purchase", "Warehouse", "Management"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const STAFF_EVENTS = [
  "staff.sales_order.created",
  "staff.purchase_request.created",
  "staff.approval.pending",
  "staff.invoice.overdue",
  "staff.payment.received",
  "staff.dispatch.ready",
] as const;
export type StaffEvent = (typeof STAFF_EVENTS)[number];

export const STAFF_EVENT_LABEL: Record<StaffEvent, string> = {
  "staff.sales_order.created": "New Sales Order",
  "staff.purchase_request.created": "New Purchase Request",
  "staff.approval.pending": "Pending Approval",
  "staff.invoice.overdue": "Invoice Overdue",
  "staff.payment.received": "Payment Received",
  "staff.dispatch.ready": "Dispatch Ready",
};

async function assertHasAnyRole(db: any, userId: string, roles: AllowedRole[]) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", roles as any);
  if (error || !data || data.length === 0) throw new Error("Forbidden");
}

const EVENT_ROLES: Record<StaffEvent, AllowedRole[]> = {
  "staff.sales_order.created": ["admin", "sales"],
  "staff.purchase_request.created": ["admin", "production"],
  "staff.approval.pending": ["admin", "accountant"],
  "staff.invoice.overdue": ["admin", "accountant"],
  "staff.payment.received": ["admin", "accountant"],
  "staff.dispatch.ready": ["admin", "production"],
};

function normalizeWa(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/[\s\-()]/g, "");
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : null;
}

/**
 * Fan-out a staff notification: resolves all active employees whose department
 * is subscribed to `event`, then sends each one a WhatsApp message. Logs every
 * attempt to notification_log with party_kind='staff'.
 */
export const notifyStaffEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event: z.enum(STAFF_EVENTS),
        ref_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, EVENT_ROLES[data.event]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    const { getWhatsAppProvider } = await import("./whatsapp/provider.server");

    const { data: companyId, error: companyError } =
      await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");

    // 1. Which departments are subscribed to this event in the active company?
    const { data: subs, error: subsError } = await supabaseAdmin
      .from("employee_notification_subscriptions")
      .select("department")
      .eq("company_id", companyId)
      .eq("event_key", data.event)
      .eq("is_active", true);
    if (subsError) throw new Error("Could not load notification subscriptions");

    const depts = Array.from(new Set((subs ?? []).map((s) => s.department)));
    if (depts.length === 0) return { ok: true, sent: 0, recipients: 0 };

    const { data: emps } = await supabaseAdmin
      .from("employees")
      .select("id, full_name, phone, department, is_active, company_id")
      .eq("company_id", companyId)
      .in("department", depts)
      .eq("is_active", true);

    if (!emps || emps.length === 0) return { ok: true, sent: 0, recipients: 0 };

    const enrichedVars: Record<string, string | number | null | undefined> = {};
    const expectedRefTable: Record<StaffEvent, string> = {
      "staff.sales_order.created": "sales_orders",
      "staff.purchase_request.created": "purchase_bills",
      "staff.approval.pending": "approvals",
      "staff.invoice.overdue": "invoices",
      "staff.payment.received": "vouchers",
      "staff.dispatch.ready": "production_orders",
    };
    if (data.event === "staff.sales_order.created") {
      if (!data.ref_id) throw new Error("Sales-order notification requires a reference");
      const { data: order, error } = await context.supabase
        .from("sales_orders")
        .select("id, order_number, total_amount, party_id")
        .eq("id", data.ref_id)
        .maybeSingle();
      if (error || !order) throw new Error("Sales order not found");
      enrichedVars.order_no = order.order_number;
      enrichedVars.order_value = Number(order.total_amount ?? 0).toFixed(2);
      if (order.party_id) {
        const { data: party } = await context.supabase
          .from("parties")
          .select("name")
          .eq("id", order.party_id)
          .maybeSingle();
        if (!party) throw new Error("Customer not found");
        enrichedVars.customer_name = party.name;
      }
    } else if (data.event === "staff.purchase_request.created") {
      if (!data.ref_id) throw new Error("Purchase notification requires a reference");
      const { data: bill, error } = await context.supabase
        .from("purchase_bills")
        .select("id, bill_number, total_amount, supplier_id")
        .eq("id", data.ref_id)
        .maybeSingle();
      if (error || !bill) throw new Error("Purchase bill not found");
      enrichedVars.po_number = bill.bill_number;
      enrichedVars.po_value = Number(bill.total_amount ?? 0).toFixed(2);
      if (bill.supplier_id) {
        const { data: supplier } = await context.supabase
          .from("suppliers")
          .select("name")
          .eq("id", bill.supplier_id)
          .maybeSingle();
        if (!supplier) throw new Error("Supplier not found");
        enrichedVars.vendor_name = supplier.name;
      }
    } else if (data.event === "staff.payment.received") {
      if (!data.ref_id) throw new Error("Payment notification requires a reference");
      const { data: voucher, error } = await context.supabase
        .from("vouchers")
        .select(
          "id, voucher_number, voucher_entries!inner(credit, ledger_accounts!inner(mapped_party_id))",
        )
        .eq("id", data.ref_id)
        .maybeSingle();
      if (error || !voucher) throw new Error("Payment voucher not found");
      const entries = (voucher.voucher_entries ?? []) as Array<any>;
      enrichedVars.receipt_no = voucher.voucher_number;
      enrichedVars.payment_amount = entries
        .reduce((sum, row) => sum + Number(row.credit ?? 0), 0)
        .toFixed(2);
      const partyId = entries.find((row) => row.ledger_accounts?.mapped_party_id)
        ?.ledger_accounts?.mapped_party_id;
      if (!partyId) throw new Error("Payment voucher is not linked to a customer");
      const { data: party } = await context.supabase
        .from("parties")
        .select("name")
        .eq("id", partyId)
        .maybeSingle();
      if (!party) throw new Error("Customer not found");
      enrichedVars.customer_name = party.name;
    } else if (data.event === "staff.dispatch.ready") {
      if (!data.ref_id) throw new Error("Dispatch notification requires a reference");
      const { data: order, error } = await context.supabase
        .from("production_orders")
        .select(
          "id, production_number, tracking_number, transporter_name, sales_orders!inner(order_number, party_id)",
        )
        .eq("id", data.ref_id)
        .maybeSingle();
      if (error || !order) throw new Error("Production order not found");
      const so = Array.isArray(order.sales_orders) ? order.sales_orders[0] : order.sales_orders;
      enrichedVars.order_no = so?.order_number ?? order.production_number;
      enrichedVars.tracking_no = order.tracking_number ?? "";
      enrichedVars.transporter_name = order.transporter_name ?? "";
      const partyId = so?.party_id;
      if (!partyId) throw new Error("Production order is not linked to a customer");
      const { data: party } = await context.supabase
        .from("parties")
        .select("name")
        .eq("id", partyId)
        .maybeSingle();
      if (!party) throw new Error("Customer not found");
      enrichedVars.customer_name = party.name;
    } else {
      throw new Error("This notification event is not enabled for direct dispatch");
    }

    // 3. Resolve template
    const { data: tpl } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("template_name, language_code, variables, is_active")
      .eq("event_key", data.event)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const provider = await getWhatsAppProvider();
    const providerReady = provider.isConfigured();

    let sent = 0;
    for (const emp of emps) {
      const to = normalizeWa(emp.phone);
      const baseLog = {
        party_kind: "staff" as const,
        event_type: data.event,
        ref_table: expectedRefTable[data.event],
        ref_id: data.ref_id,
        payload: { employee_id: emp.id, department: emp.department, source: "verified-record" },
      };
      if (!to) {
        await logWhatsAppNotification({
          ...baseLog,
          status: "skipped",
          failure_reason: "no phone",
        });
        continue;
      }
      if (!providerReady) {
        await logWhatsAppNotification({
          ...baseLog,
          recipient_phone: to,
          status: "skipped",
          failure_reason: "provider not configured",
        });
        continue;
      }
      const allVars: Record<string, string | number | null | undefined> = {
        employee_name: emp.full_name,
        ...enrichedVars,
      };
      let result;
      if (tpl?.template_name) {
        const varNames = Array.isArray(tpl.variables) ? (tpl.variables as string[]) : [];
        const bodyValues = varNames.map((n) => String(allVars[n] ?? ""));
        result = await provider.sendTemplate({
          to,
          templateName: tpl.template_name,
          languageCode: tpl.language_code ?? "en",
          bodyVariables: bodyValues,
        });
      } else {
        await logWhatsAppNotification({
          ...baseLog,
          recipient_phone: to,
          status: "skipped",
          failure_reason: "no approved WhatsApp template configured",
        });
        continue;
      }
      await logWhatsAppNotification({
        ...baseLog,
        recipient_phone: to,
        template_name: tpl?.template_name ?? null,
        status: result.ok ? "sent" : result.status,
        whatsapp_message_id: result.ok ? result.messageId : null,
        failure_reason: result.ok ? null : result.error,
      });
      if (result.ok) sent++;
    }
    return { ok: true, sent, recipients: emps.length };
  });

/** Admin/HR: list subscriptions */
export const listSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "hr"]);
    const { data: companyId, error: companyError } =
      await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("employee_notification_subscriptions")
      .select("id, company_id, department, event_key, is_active")
      .eq("company_id", companyId)
      .order("department");
    if (error) throw error;
    return data ?? [];
  });

/** Admin/HR: toggle a (department, event) subscription on/off (creates row if missing) */
export const setSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        department: z.enum(DEPARTMENTS),
        event_key: z.enum(STAFF_EVENTS),
        is_active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "hr"]);
    const { data: companyId, error: companyError } =
      await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("employee_notification_subscriptions").upsert(
      {
        company_id: companyId,
        department: data.department,
        event_key: data.event_key,
        is_active: data.is_active,
      },
      { onConflict: "company_id,department,event_key" },
    );
    if (error) throw error;
    return { ok: true };
  });

/** Admin/HR: count active employees per department (for the settings screen) */
export const departmentEmployeeCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "hr"]);
    const { data: companyId, error: companyError } =
      await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("employees")
      .select("department, phone, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true);
    const counts: Record<string, { total: number; with_phone: number }> = {};
    for (const d of DEPARTMENTS) counts[d] = { total: 0, with_phone: 0 };
    for (const e of data ?? []) {
      if (!e.department || !(e.department in counts)) continue;
      counts[e.department].total++;
      if (e.phone && e.phone.replace(/\D/g, "").length >= 8) counts[e.department].with_phone++;
    }
    return counts;
  });
