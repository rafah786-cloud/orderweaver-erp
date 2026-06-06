import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

type LogParams = {
  party_kind: "customer" | "vendor" | "staff" | "admin";
  party_id?: string | null;
  recipient_phone?: string | null;
  event_type: string;
  ref_table?: string | null;
  ref_id?: string | null;
  status: "sent" | "failed" | "skipped";
  error?: string | null;
  payload?: Record<string, unknown> | null;
};

async function logNotification(p: LogParams) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notification_log").insert({
    channel: "whatsapp",
    party_kind: p.party_kind,
    party_id: p.party_id ?? null,
    recipient_phone: p.recipient_phone ?? null,
    event_type: p.event_type,
    ref_table: p.ref_table ?? null,
    ref_id: p.ref_id ?? null,
    status: p.status,
    error: p.error ?? null,
    payload: (p.payload ?? null) as any,
  });
}

function normalizeWa(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/[\s\-()]/g, "");
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : null;
}

async function sendViaTwilio(toE164: string, body: string): Promise<{ ok: true; sid: string } | { ok: false; error: string; status: "failed" | "skipped" }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM ?? "+14155238886"; // Twilio sandbox default
  if (!lovableKey || !twilioKey) {
    return { ok: false, error: "Twilio not configured", status: "skipped" };
  }
  try {
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": twilioKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: `whatsapp:${fromNumber}`,
        To: `whatsapp:${toE164}`,
        Body: body.slice(0, 1500),
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `Twilio ${res.status}: ${json?.message ?? "error"}`, status: "failed" };
    }
    return { ok: true, sid: json.sid ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed", status: "failed" };
  }
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
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bill, error } = await supabaseAdmin
      .from("purchase_bills")
      .select("id, bill_number, bill_date, total_amount, supplier_id, suppliers(id, name, phone, whatsapp_number, whatsapp_opt_in)")
      .eq("id", data.bill_id)
      .maybeSingle();
    if (error || !bill) throw new Error("Bill not found");
    const sup: any = (bill as any).suppliers;
    if (!sup) {
      await logNotification({ party_kind: "vendor", event_type: `purchase_bill.${data.event}`, ref_table: "purchase_bills", ref_id: bill.id, status: "skipped", error: "no supplier" });
      return { ok: false, reason: "no_supplier" };
    }
    if (!sup.whatsapp_opt_in) {
      await logNotification({ party_kind: "vendor", party_id: sup.id, event_type: `purchase_bill.${data.event}`, ref_table: "purchase_bills", ref_id: bill.id, status: "skipped", error: "opted out" });
      return { ok: false, reason: "opt_out" };
    }
    const to = normalizeWa(sup.whatsapp_number ?? sup.phone);
    if (!to) {
      await logNotification({ party_kind: "vendor", party_id: sup.id, event_type: `purchase_bill.${data.event}`, ref_table: "purchase_bills", ref_id: bill.id, status: "skipped", error: "no phone" });
      return { ok: false, reason: "no_phone" };
    }
    const verb = data.event === "created" ? "placed" : data.event === "cancelled" ? "cancelled" : "updated";
    const body =
      `Zizz Mattress — Purchase Order ${verb}\n` +
      `PO #: ${bill.bill_number}\n` +
      `Date: ${bill.bill_date}\n` +
      `Amount: ₹${Number(bill.total_amount ?? 0).toFixed(2)}\n` +
      (data.event === "created" ? `Please log in to the vendor portal to acknowledge.` : `Login to view details.`);
    const result = await sendViaTwilio(to, body);
    await logNotification({
      party_kind: "vendor",
      party_id: sup.id,
      recipient_phone: to,
      event_type: `purchase_bill.${data.event}`,
      ref_table: "purchase_bills",
      ref_id: bill.id,
      status: result.ok ? "sent" : result.status,
      error: result.ok ? null : result.error,
      payload: { body },
    });
    return { ok: result.ok };
  });

/** Sales/Admin → notify customer about a sales-side event */
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
        "ledger.statement_ready",
      ]),
      ref_table: z.string().optional(),
      ref_id: z.string().uuid().optional(),
      message: z.string().min(1).max(1500),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: party } = await supabaseAdmin
      .from("parties")
      .select("id, name, phone")
      .eq("id", data.party_id)
      .maybeSingle();
    if (!party) throw new Error("Party not found");
    const to = normalizeWa(party.phone);
    if (!to) {
      await logNotification({ party_kind: "customer", party_id: party.id, event_type: data.event, ref_table: data.ref_table ?? null, ref_id: data.ref_id ?? null, status: "skipped", error: "no phone" });
      return { ok: false, reason: "no_phone" };
    }
    const result = await sendViaTwilio(to, data.message);
    await logNotification({
      party_kind: "customer",
      party_id: party.id,
      recipient_phone: to,
      event_type: data.event,
      ref_table: data.ref_table ?? null,
      ref_id: data.ref_id ?? null,
      status: result.ok ? "sent" : result.status,
      error: result.ok ? null : result.error,
      payload: { message: data.message },
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
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bill } = await supabaseAdmin
      .from("purchase_bills")
      .select("id, bill_number, total_amount, suppliers(name)")
      .eq("id", data.bill_id)
      .maybeSingle();
    if (!bill) throw new Error("Bill not found");
    const vendorName = (bill as any).suppliers?.name ?? "Vendor";
    const verb = data.status === "accepted" ? "ACCEPTED" : "REJECTED";
    const body =
      `Zizz Mattress — PO ${verb} by Vendor\n` +
      `PO #: ${bill.bill_number}\n` +
      `Vendor: ${vendorName}\n` +
      `Amount: ₹${Number(bill.total_amount ?? 0).toFixed(2)}\n` +
      (data.expected_dispatch_date ? `Expected dispatch: ${data.expected_dispatch_date}\n` : ``) +
      (data.note ? `Note: ${data.note}` : ``);

    // Find admin/purchase staff with WhatsApp opted-in
    const { data: recipients } = await supabaseAdmin
      .from("profiles")
      .select("id, whatsapp_number, phone, whatsapp_opt_in, user_roles!inner(role)")
      .eq("whatsapp_opt_in", true)
      .in("user_roles.role", ["admin"]);
    const list = (recipients ?? []) as any[];
    if (list.length === 0) {
      await logNotification({ party_kind: "admin", event_type: `purchase_bill.${data.status}`, ref_table: "purchase_bills", ref_id: bill.id, status: "skipped", error: "no recipients" });
      return { ok: false, reason: "no_recipients" };
    }
    let sent = 0;
    for (const r of list) {
      const to = normalizeWa(r.whatsapp_number ?? r.phone);
      if (!to) continue;
      const result = await sendViaTwilio(to, body);
      await logNotification({
        party_kind: "admin",
        party_id: r.id,
        recipient_phone: to,
        event_type: `purchase_bill.${data.status}`,
        ref_table: "purchase_bills",
        ref_id: bill.id,
        status: result.ok ? "sent" : result.status,
        error: result.ok ? null : result.error,
        payload: { body },
      });
      if (result.ok) sent += 1;
    }
    return { ok: sent > 0, sent };
  });

export const getWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return {
      configured: Boolean(process.env.LOVABLE_API_KEY && process.env.TWILIO_API_KEY),
      from: process.env.TWILIO_WHATSAPP_FROM ?? null,
    };
  });
