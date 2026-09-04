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
    await supabaseAdmin.from("ai_audit_log").insert({
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
