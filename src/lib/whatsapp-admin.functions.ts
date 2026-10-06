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
  if (error || !data) throw new Error("Forbidden");
}

async function activeCompanyId(db: any): Promise<string> {
  const { data, error } = await db.rpc("current_company_id");
  if (error || !data) throw new Error("No active company selected");
  return data;
}

export const KNOWN_EVENT_KEYS = [
  "sales_order.created",
  "production_order.ready",
  "invoice.issued",
  "invoice.paid",
  "payment.received",
  "dispatch.update",
  "ledger.statement_ready",
  "purchase_order.created",
  "purchase_order.updated",
  "purchase_order.cancelled",
  "purchase_order.accepted",
  "purchase_order.rejected",
] as const;

export const listWhatsAppTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("*")
      .order("event_key", { ascending: true });
    if (error) throw error;
    return { templates: data ?? [] };
  });

export const upsertWhatsAppTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        template_name: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[a-zA-Z0-9_]+$/, "Letters, digits, underscores only"),
        event_key: z.string().min(1).max(100),
        description: z.string().max(500).optional().nullable(),
        language_code: z.string().min(2).max(10).default("en"),
        variables: z.array(z.string().min(1).max(100)).max(20).default([]),
        is_active: z.boolean().default(true),
        body_template: z.string().max(4000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      template_name: data.template_name,
      event_key: data.event_key,
      description: data.description ?? null,
      language_code: data.language_code,
      variables: data.variables as any,
      is_active: data.is_active,
      body_template: data.body_template ?? null,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("whatsapp_templates")
        .update(row)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("whatsapp_templates")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: ins.id };
  });

export const deleteWhatsAppTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_templates").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listWhatsAppLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        party_kind: z.enum(["customer", "vendor", "staff", "admin"]).optional(),
        party_id: z.string().uuid().optional(),
        status: z.enum(["sent", "failed", "skipped"]).optional(),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(1000).default(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await activeCompanyId(context.supabase);

    // Admin reporting remains company-scoped unless the user explicitly uses
    // the separate consolidated accounting views.
    const [{ data: customerRows }, { data: vendorRows }, { data: memberRows }] = await Promise.all([
      supabaseAdmin.from("parties").select("id").eq("company_id", companyId),
      supabaseAdmin.from("suppliers").select("id").eq("company_id", companyId),
      supabaseAdmin
        .from("user_company_access")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("can_view", true),
    ]);
    const customerIds = (customerRows ?? []).map((r) => r.id);
    const vendorIds = (vendorRows ?? []).map((r) => r.id);
    const memberIds = (memberRows ?? []).map((r) => r.user_id);
    const scopeClauses = [
      customerIds.length
        ? `and(party_kind.eq.customer,party_id.in.(${customerIds.join(",")}))`
        : null,
      vendorIds.length ? `and(party_kind.eq.vendor,party_id.in.(${vendorIds.join(",")}))` : null,
      memberIds.length
        ? `and(party_kind.in.(staff,admin),party_id.in.(${memberIds.join(",")}))`
        : null,
    ].filter(Boolean);
    if (scopeClauses.length === 0) throw new Error("No company-scoped notification recipients");
    const scopedOr = scopeClauses.join(",");
    let q = supabaseAdmin
      .from("notification_log")
      .select(
        "id, sent_at, channel, party_kind, party_id, recipient_phone, event_type, template_name, status, whatsapp_message_id, read_status, read_at, failure_reason, ref_table, ref_id",
      )
      .eq("channel", "whatsapp")
      .order("sent_at", { ascending: false })
      .limit(data.limit);
    q = q.or(scopedOr);
    if (data.from) q = q.gte("sent_at", data.from);
    if (data.to) q = q.lte("sent_at", data.to);
    if (data.party_kind) q = q.eq("party_kind", data.party_kind);
    if (data.party_id) q = q.eq("party_id", data.party_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.ilike("recipient_phone", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Resolve party names in two batched queries.
    const partyIds = Array.from(
      new Set(
        (rows ?? [])
          .filter((r) => r.party_kind === "customer" && r.party_id)
          .map((r) => r.party_id as string),
      ),
    );
    const vendorIds = Array.from(
      new Set(
        (rows ?? [])
          .filter((r) => r.party_kind === "vendor" && r.party_id)
          .map((r) => r.party_id as string),
      ),
    );
    const adminIds = Array.from(
      new Set(
        (rows ?? [])
          .filter((r) => (r.party_kind === "admin" || r.party_kind === "staff") && r.party_id)
          .map((r) => r.party_id as string),
      ),
    );

    const [parties, vendors, admins] = await Promise.all([
      partyIds.length
        ? supabaseAdmin.from("parties").select("id, name").in("id", partyIds)
        : Promise.resolve({ data: [] as any[] }),
      vendorIds.length
        ? supabaseAdmin.from("suppliers").select("id, name").in("id", vendorIds)
        : Promise.resolve({ data: [] as any[] }),
      adminIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name").in("id", adminIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const nameMap = new Map<string, string>();
    (parties.data ?? []).forEach((r: any) => nameMap.set(r.id, r.name));
    (vendors.data ?? []).forEach((r: any) => nameMap.set(r.id, r.name));
    (admins.data ?? []).forEach((r: any) => nameMap.set(r.id, r.full_name ?? "Staff"));

    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        recipient_name: r.party_id ? (nameMap.get(r.party_id as string) ?? "—") : "—",
      })),
    };
  });

export const listCustomersForFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await activeCompanyId(context.supabase);
    const { data } = await supabaseAdmin
      .from("parties")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name")
      .limit(500);
    return { customers: data ?? [] };
  });

export const listVendorsForFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await activeCompanyId(context.supabase);
    const { data } = await supabaseAdmin
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name")
      .limit(500);
    return { vendors: data ?? [] };
  });
