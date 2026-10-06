import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { KNOWN_EVENT_KEYS } from "@/lib/whatsapp-admin.functions";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

type InteraktTemplate = {
  name: string;
  status: string; // APPROVED | PENDING | REJECTED
  language: string;
  category?: string;
  variable_count: number;
  body_text?: string;
};

/** Extract {{1}}, {{2}}, ... placeholders and return max index. */
function countVars(text: string): number {
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  // Also handle named vars like {{customer_name}} by counting uniques if no numeric found
  if (max === 0) {
    const named = new Set<string>();
    const nre = /\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g;
    while ((m = nre.exec(text)) !== null) named.add(m[1]);
    return named.size;
  }
  return max;
}

/** Best-effort parse of Interakt template payload into a normalized shape. */
function normalizeInterakt(raw: any): InteraktTemplate[] {
  const list: any[] =
    raw?.results ??
    raw?.data?.results ??
    raw?.data ??
    raw?.templates ??
    (Array.isArray(raw) ? raw : []);
  return list.map((t) => {
    const name: string = t.name ?? t.template_name ?? "";
    const status: string = String(t.status ?? t.template_status ?? "UNKNOWN").toUpperCase();
    const language: string = t.language ?? t.language_code ?? "en";
    const category: string | undefined = t.category ?? t.template_category;
    // Body text can appear in several shapes
    let body = "";
    if (Array.isArray(t.components)) {
      const b = t.components.find((c: any) => String(c.type).toUpperCase() === "BODY");
      body = b?.text ?? b?.body ?? "";
    }
    body = body || t.body_text || t.body || t.message || "";
    return {
      name,
      status,
      language,
      category,
      variable_count: countVars(body),
      body_text: body || undefined,
    };
  }).filter((t) => t.name);
}

async function fetchInteraktTemplatesRaw(): Promise<InteraktTemplate[]> {
  const key = process.env.INTERAKT_API_KEY;
  if (!key) throw new Error("INTERAKT_API_KEY not configured");
  const base = process.env.INTERAKT_BASE_URL || "https://api.interakt.ai/v1/public";
  // Common endpoints — try in order until one responds ok.
  const candidates = [
    `${base}/message/templates/`,
    `${base}/organizations/templates/`,
    `https://api.interakt.ai/v1/organizations/templates/`,
  ];
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
  let lastErr = "no endpoint responded";
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: auth, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        const list = normalizeInterakt(json);
        if (list.length > 0 || Array.isArray(json) || json?.results) return list;
      } else {
        lastErr = `Interakt ${res.status} at ${url}`;
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "network error";
    }
  }
  throw new Error(lastErr);
}

/** Fuzzy-match a template name to a known event key. */
function guessEventKey(name: string): string | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rules: Array<[string, string]> = [
    ["orderconfirmed", "sales_order.created"],
    ["salesordercreated", "sales_order.created"],
    ["salesorder", "sales_order.created"],
    ["orderdispatched", "dispatch.update"],
    ["dispatch", "dispatch.update"],
    ["productionready", "production_order.ready"],
    ["ready", "production_order.ready"],
    ["purchaseorder", "purchase_order.created"],
    ["poconfirmed", "purchase_order.created"],
    ["poaccepted", "purchase_order.accepted"],
    ["porejected", "purchase_order.rejected"],
    ["pocancelled", "purchase_order.cancelled"],
    ["poupdated", "purchase_order.updated"],
    ["paymentreceived", "payment.received"],
    ["invoicepaid", "invoice.paid"],
    ["invoiceissued", "invoice.issued"],
    ["invoice", "invoice.issued"],
    ["ledgerstatement", "ledger.statement_ready"],
    ["statement", "ledger.statement_ready"],
  ];
  for (const [needle, key] of rules) {
    if (n.includes(needle)) return key;
  }
  return null;
}

export const fetchInteraktTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    try {
      const templates = await fetchInteraktTemplatesRaw();
      return { ok: true as const, templates };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "fetch failed", templates: [] as InteraktTemplate[] };
    }
  });

export type TemplateValidation = {
  event_key: string;
  local_name: string | null;
  local_var_count: number;
  interakt_found: boolean;
  interakt_status: string | null;
  interakt_var_count: number | null;
  is_approved: boolean;
  vars_match: boolean;
  ok: boolean;
  issue: string | null;
};

export const validateWhatsAppTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let remote: InteraktTemplate[] = [];
    let remoteError: string | null = null;
    try {
      remote = await fetchInteraktTemplatesRaw();
    } catch (e) {
      remoteError = e instanceof Error ? e.message : "fetch failed";
    }
    const remoteByName = new Map(remote.map((t) => [t.name.toLowerCase(), t]));
    const { data: locals } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("event_key, template_name, variables");

    const localByEvent = new Map<string, { name: string; vars: number }>();
    for (const l of locals ?? []) {
      const vars = Array.isArray((l as any).variables) ? ((l as any).variables as any[]).length : 0;
      localByEvent.set(l.event_key as string, { name: (l as any).template_name, vars });
    }

    const results: TemplateValidation[] = KNOWN_EVENT_KEYS.map((event_key) => {
      const local = localByEvent.get(event_key);
      const remoteHit = local ? remoteByName.get(local.name.toLowerCase()) : undefined;
      const is_approved = remoteHit ? remoteHit.status === "APPROVED" : false;
      const vars_match =
        remoteHit != null && local != null && remoteHit.variable_count === local.vars;
      let issue: string | null = null;
      if (!local) issue = "No local mapping for this event";
      else if (!remoteHit) issue = `Template "${local.name}" not found in Interakt`;
      else if (!is_approved) issue = `Template status is ${remoteHit.status}, needs APPROVED`;
      else if (!vars_match)
        issue = `Variable count mismatch: local ${local.vars} vs Interakt ${remoteHit.variable_count}`;
      return {
        event_key,
        local_name: local?.name ?? null,
        local_var_count: local?.vars ?? 0,
        interakt_found: Boolean(remoteHit),
        interakt_status: remoteHit?.status ?? null,
        interakt_var_count: remoteHit?.variable_count ?? null,
        is_approved,
        vars_match,
        ok: Boolean(local) && Boolean(remoteHit) && is_approved && vars_match,
        issue,
      };
    });

    return {
      remoteError,
      remote_count: remote.length,
      results,
      all_ok: remoteError == null && results.every((r) => r.ok),
    };
  });

export const importInteraktTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        overwrite: z.boolean().default(false),
        onlyApproved: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const remote = await fetchInteraktTemplatesRaw();

    const { data: locals } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("id, event_key, template_name");
    const existingByEvent = new Map(
      (locals ?? []).map((l) => [l.event_key as string, l as any]),
    );

    // Build event -> best remote template
    const chosen = new Map<string, InteraktTemplate>();
    for (const t of remote) {
      if (data.onlyApproved && t.status !== "APPROVED") continue;
      const key = guessEventKey(t.name);
      if (!key) continue;
      const prev = chosen.get(key);
      // Prefer approved, then more recent name match (shortest wins as tiebreak)
      if (!prev || (prev.status !== "APPROVED" && t.status === "APPROVED") ||
          (prev.status === t.status && t.name.length < prev.name.length)) {
        chosen.set(key, t);
      }
    }

    const inserted: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    for (const [event_key, tpl] of chosen) {
      const variables = Array.from({ length: tpl.variable_count }, (_, i) => `var${i + 1}`);
      const existing = existingByEvent.get(event_key);
      if (existing && !data.overwrite) {
        skipped.push(event_key);
        continue;
      }
      const row = {
        template_name: tpl.name,
        event_key,
        language_code: tpl.language || "en",
        variables: variables as any,
        is_active: true,
        body_template: tpl.body_text ?? null,
        description: `Imported from Interakt (${tpl.status})`,
      };
      if (existing) {
        const { error } = await supabaseAdmin
          .from("whatsapp_templates")
          .update(row)
          .eq("id", existing.id);
        if (error) throw error;
        updated.push(event_key);
      } else {
        const { error } = await supabaseAdmin.from("whatsapp_templates").insert(row);
        if (error) throw error;
        inserted.push(event_key);
      }
    }

    const unmapped = remote
      .filter((t) => !guessEventKey(t.name))
      .map((t) => ({ name: t.name, status: t.status }));

    return {
      ok: true,
      inserted,
      updated,
      skipped,
      unmapped_remote: unmapped,
      total_remote: remote.length,
    };
  });
