import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(db: any, userId: string) {
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin only");
}

/** Normalize a raw phone into E.164. Accepts bare 10-digit Indian numbers. */
function normalizeWa(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw.replace(/[\s\-()]/g, "");
  if (!t.startsWith("+")) {
    if (/^[6-9]\d{9}$/.test(t)) t = `+91${t}`;
    else t = `+${t}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(t) ? t : null;
}

async function resolveTemplate(db: any, eventKey: string) {
  const { data } = await db
    .from("whatsapp_templates")
    .select("template_name, language_code, variables, is_active")
    .eq("event_key", eventKey)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

async function sendWa(opts: {
  to: string;
  template: NonNullable<Awaited<ReturnType<typeof resolveTemplate>>>;
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
  const tpl = opts.template;
  if (tpl?.template_name) {
    const varNames = Array.isArray(tpl.variables) ? (tpl.variables as string[]) : [];
    const bodyValues = varNames.map((n) => String(opts.vars[n] ?? ""));
    const r = await provider.sendTemplate({
      to: opts.to,
      templateName: tpl.template_name,
      languageCode: tpl.language_code ?? "en",
      bodyVariables: bodyValues,
    });
    return r.ok
      ? { ok: true as const, messageId: r.messageId, template_name: tpl.template_name }
      : {
          ok: false as const,
          status: r.status,
          error: r.error,
          template_name: tpl.template_name,
          messageId: "",
        };
  }
  throw new Error("No approved promotional template is active");
}

const AddPartySchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(4).max(24),
});

/** Admin quick-add a customer with just Name + Mobile. */
export const quickAddParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AddPartySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const to = normalizeWa(data.phone);
    const { data: row, error } = await context.supabase
      .from("parties")
      .insert({ name: data.name, phone: data.phone, whatsapp_number: to, whatsapp_opt_in: false })
      .select("id, name")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to add party");
    return { ok: true, id: row.id };
  });

/** Admin quick-add a supplier with just Name + Mobile. */
export const quickAddSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AddPartySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const to = normalizeWa(data.phone);
    const { data: row, error } = await context.supabase
      .from("suppliers")
      .insert({ name: data.name, phone: data.phone, whatsapp_number: to, whatsapp_opt_in: true })
      .select("id, name")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to add supplier");
    return { ok: true, id: row.id };
  });

export const deleteParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("parties").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


const PartySchema = z.object({
  name: z.string().trim().min(1).max(200),
  contact_person: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  address: z.string().trim().max(2000).nullable().optional(),
  gstin: z.string().trim().max(30).nullable().optional(),
  credit_limit: z.number().finite().min(0),
  notes: z.string().trim().max(5000).nullable().optional(),
  opening_balance: z.number().finite(),
});

export const saveParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    party: PartySchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).in("role", ["admin", "sales"]);
    if (!roles?.length) throw new Error("Insufficient permissions");
    if (data.id) {
      const { error } = await context.supabase.from("parties").update(data.party).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const { data: row, error } = await context.supabase.from("parties")
      .insert({ ...data.party, company_id: companyId }).select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create party");
    return { id: row.id };
  });

const BroadcastSchema = z.object({
  audience: z.enum(["parties", "suppliers"]),
});

/** Admin broadcast an approved template to all opted-in parties or suppliers. */
export const broadcastPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BroadcastSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { logWhatsAppNotification } = await import("./whatsapp/log.server");
    const table = data.audience === "parties" ? "parties" : "suppliers";
    const eventKey = data.audience === "parties" ? "party.promo" : "supplier.promo";
    const partyKind = data.audience === "parties" ? "customer" : "vendor";
    const nameVar = data.audience === "parties" ? "customer_name" : "vendor_name";
    const template = await resolveTemplate(context.supabase, eventKey);
    if (!template?.template_name) throw new Error("No approved promotional template is active");
    const { data: activeCompanyId, error: companyError } =
      await context.supabase.rpc("current_company_id");
    if (companyError || !activeCompanyId) throw new Error("No active company selected");
    const { data: rows } = await context.supabase
      .from(table)
      .select("id, name, phone, whatsapp_number, whatsapp_opt_in, promo_opt_in, company_id")
      .eq("company_id", activeCompanyId)
      .eq("whatsapp_opt_in", true)
      .eq("promo_opt_in", true);

    const list = (rows ?? []) as Array<{
      id: string;
      name: string;
      phone: string | null;
      whatsapp_number: string | null;
    }>;
    let sent = 0;
    let skipped = 0;
    for (const r of list) {
      const to = normalizeWa(r.whatsapp_number ?? r.phone);
      if (!to) {
        skipped += 1;
        await logWhatsAppNotification({
          party_kind: partyKind,
          party_id: r.id,
          event_type: eventKey,
          ref_table: table,
          ref_id: r.id,
          status: "skipped",
          failure_reason: "no phone",
        });
        continue;
      }
      const res = await sendWa({
        to,
        template,
        vars: { [nameVar]: r.name },
      });
      await logWhatsAppNotification({
        party_kind: partyKind,
        party_id: r.id,
        recipient_phone: to,
        event_type: eventKey,
        template_name: res.template_name,
        ref_table: table,
        ref_id: r.id,
        status: res.ok ? "sent" : res.status,
        whatsapp_message_id: res.ok ? res.messageId : null,
        failure_reason: res.ok ? null : res.error,
        payload: { approved_template: template.template_name },
      });
      if (res.ok) sent += 1;
      else skipped += 1;
    }
    return { ok: true, sent, skipped, total: list.length };
  });
