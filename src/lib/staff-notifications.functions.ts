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
        ref_table: z.string().optional(),
        ref_id: z.string().uuid().optional(),
        vars: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
        customer_party_id: z.string().uuid().optional(),
        supplier_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Any staff member writing business events may fan out
    await assertHasAnyRole(context.userId, ["admin", "sales", "production", "accountant", "hr"]);
    // Check supplier access before any fan-out, even when a vendor name was supplied.
    let supplierName: string | undefined;
    if (data.supplier_id) {
      const { data: supplier, error } = await context.supabase
        .from("suppliers")
        .select("name")
        .eq("id", data.supplier_id)
        .maybeSingle();
      if (error || !supplier) throw new Error("Supplier not found");
      supplierName = supplier.name;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    const { getWhatsAppProvider } = await import("./whatsapp/provider.server");

    // 1. Which departments are subscribed to this event?
    const { data: subs } = await supabaseAdmin
      .from("employee_notification_subscriptions")
      .select("department")
      .eq("event_key", data.event)
      .eq("is_active", true);

    const depts = Array.from(new Set((subs ?? []).map((s) => s.department)));
    if (depts.length === 0) return { ok: true, sent: 0, recipients: 0 };

    // 2. Resolve active employees in those departments with a phone
    const { data: emps } = await supabaseAdmin
      .from("employees")
      .select("id, full_name, phone, department, is_active")
      .in("department", depts)
      .eq("is_active", true);

    if (!emps || emps.length === 0) return { ok: true, sent: 0, recipients: 0 };

    // 2b. Resolve optional party/supplier names so callers don't need to pre-fetch them
    const enrichedVars: Record<string, string | number | null | undefined> = { ...data.vars };
    if (data.customer_party_id && enrichedVars.customer_name === undefined) {
      const { data: party } = await supabaseAdmin
        .from("parties")
        .select("name")
        .eq("id", data.customer_party_id)
        .maybeSingle();
      if (party?.name) enrichedVars.customer_name = party.name;
    }
    if (supplierName !== undefined) enrichedVars.vendor_name = supplierName;

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
        ref_table: data.ref_table ?? null,
        ref_id: data.ref_id ?? null,
        payload: { employee_id: emp.id, department: emp.department, vars: data.vars },
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
        const body = [
          `Notification: ${data.event}`,
          ...Object.entries(allVars).map(([k, v]) => `${k}: ${v}`),
        ].join("\n");
        result = await provider.sendFreeform({ to, body });
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
    await assertHasAnyRole(context.userId, ["admin", "hr"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("employee_notification_subscriptions")
      .select("id, department, event_key, is_active")
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
    await assertHasAnyRole(context.userId, ["admin", "hr"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("employee_notification_subscriptions")
      .upsert(
        { department: data.department, event_key: data.event_key, is_active: data.is_active },
        { onConflict: "department,event_key" },
      );
    if (error) throw error;
    return { ok: true };
  });

/** Admin/HR: count active employees per department (for the settings screen) */
export const departmentEmployeeCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHasAnyRole(context.userId, ["admin", "hr"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("employees")
      .select("department, phone, is_active")
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
