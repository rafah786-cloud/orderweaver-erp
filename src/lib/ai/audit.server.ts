async function resolveAuditCompany(
  caller: any,
  userId: string | null,
  refTable?: string | null,
  refId?: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const { data: companyId, error: companyError } = await caller.rpc("current_company_id");
  if (companyError || typeof companyId !== "string" || !companyId) return null;
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
    const { data, error } = await caller
      .from(refTable)
      .select("company_id")
      .eq("id", refId)
      .maybeSingle();
    if (error || data?.company_id !== companyId) return null;
  }

  if ((refTable || refId) && (!refTable || !refId || !sourceTables.has(refTable))) return null;
  return companyId;
}

/** Audit trail for every AI request (server-only, best effort — never throws). */
export async function logAiUsage(caller: any, entry: {
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
    const companyId = await resolveAuditCompany(
      caller,
      entry.userId,
      entry.refTable,
      entry.refId,
    );
    if (!companyId) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
