async function resolveAuditCompany(
  supabaseAdmin: any,
  userId: string | null,
  refTable?: string | null,
  refId?: string | null,
): Promise<string | null> {
  const sourceTables = new Set([
    "invoices",
    "sales_orders",
    "purchase_bills",
    "production_orders",
    "parties",
    "suppliers",
    "vouchers",
    "ai_documents",
    "ai_proposals",
  ]);

  if (refTable && refId && sourceTables.has(refTable)) {
    const { data } = await supabaseAdmin
      .from(refTable)
      .select("company_id")
      .eq("id", refId)
      .maybeSingle();
    if (data?.company_id) return data.company_id as string;
  }

  if (userId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("active_company_id")
      .eq("id", userId)
      .maybeSingle();
    if (data?.active_company_id) return data.active_company_id as string;
  }

  const { data: abood } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("code", "ABOOD")
    .eq("is_active", true)
    .maybeSingle();
  return (abood?.id as string | undefined) ?? null;
}

/** Audit trail for every AI request (server-only, best effort — never throws). */
export async function logAiUsage(entry: {
  userId: string | null;
  feature: string;
  action?: string;
  model?: string | null;
  promptSummary?: string | null;
  status?: "ok" | "error" | "blocked";
  error?: string | null;
  durationMs?: number | null;
  refTable?: string | null;
  refId?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = await resolveAuditCompany(
      supabaseAdmin,
      entry.userId,
      entry.refTable,
      entry.refId,
    );
    if (!companyId) return;

    await supabaseAdmin.from("ai_audit_log").insert({
      company_id: companyId,
      user_id: entry.userId,
      feature: entry.feature,
      action: entry.action ?? "analyze",
      model: entry.model ?? null,
      prompt_summary: entry.promptSummary ? entry.promptSummary.slice(0, 500) : null,
      status: entry.status ?? "ok",
      error: entry.error ? entry.error.slice(0, 500) : null,
      duration_ms: entry.durationMs ?? null,
      ref_table: entry.refTable ?? null,
      ref_id: entry.refId ?? null,
      meta: (entry.meta ?? null) as never,
    });
  } catch {
    // Auditing must never break an AI response or ERP flow.
  }
}
