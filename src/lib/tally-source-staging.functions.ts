import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { TALLY_SOURCES, NORMALIZATION_VERSION } from "./tally-bulk";
import { isolationClassFor, parseStagingChunk, sha256Hex } from "./tally-source-staging";

/**
 * Staging-only boundary for TallyBridge evidence. Rows are never linked to ERP
 * companies, ledgers, vouchers or stock; retries are idempotent by chunk hash
 * and by (source, idempotency_key, row hash).
 */
const chunkInput = z.object({
  sourceCompany: z.enum(TALLY_SOURCES),
  sourceCompanyGuid: z.string().max(255).nullable(),
  chunkName: z.string().min(1).max(255),
  chunkSha256: z.string().regex(/^[a-f0-9]{64}$/),
  chunkText: z.string().min(2).max(6 * 1024 * 1024),
});

async function requireApprovedAdmin(supabase: any, userId: string) {
  const [{ data: isAdmin }, { data: approved }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("is_approved", { _user_id: userId }),
  ]);
  if (!isAdmin || !approved) throw new Error("Approved administrator access required.");
}

export const stageTallySourceChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => chunkInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireApprovedAdmin(supabase, userId);
    if ((await sha256Hex(data.chunkText)) !== data.chunkSha256) throw new Error("Chunk hash mismatch; nothing staged.");
    const rows = parseStagingChunk(data.chunkText, data.sourceCompany);
    const guid = data.sourceCompanyGuid?.trim() ?? "";

    let { data: source } = await supabase.from("tally_source_staging_sources").select("id")
      .eq("source_company", data.sourceCompany).eq("source_company_guid", guid).maybeSingle();
    if (!source) {
      const { error } = await supabase.from("tally_source_staging_sources").insert({
        source_company: data.sourceCompany, source_company_guid: guid,
        isolation_class: isolationClassFor(data.sourceCompany), created_by: userId,
      });
      if (error && error.code !== "23505") throw new Error("Could not register staging source.");
      ({ data: source } = await supabase.from("tally_source_staging_sources").select("id")
        .eq("source_company", data.sourceCompany).eq("source_company_guid", guid).single());
    }
    if (!source) throw new Error("Staging source unavailable.");

    const { data: existing } = await supabase.from("tally_source_staging_chunks").select("id, row_count")
      .eq("source_id", source.id).eq("chunk_sha256", data.chunkSha256).maybeSingle();
    let chunkId = existing?.id as string | undefined;
    if (!chunkId) {
      const { data: created, error } = await supabase.from("tally_source_staging_chunks").insert({
        source_id: source.id, chunk_name: data.chunkName, chunk_sha256: data.chunkSha256,
        row_count: rows.length, normalization_version: NORMALIZATION_VERSION, staged_by: userId,
      }).select("id").single();
      if (error || !created) throw new Error("Could not register staging chunk.");
      chunkId = created.id;
    }

    const records = await Promise.all(rows.map(async (r) => ({
      source_id: source!.id, chunk_id: chunkId!, segment: r.segment ?? null, segment_sha256: r.segment_sha256 ?? null,
      message_no: r.message_no ?? null, idempotency_key: r.idempotency_key, row_sha256: await sha256Hex(r.line),
      record_type: r.record_type, source_guid: r.source_id ?? null, alter_id: r.alter_id ?? null, master_id: r.master_id ?? null,
      lifecycle_state: r.lifecycle_state ?? null, is_duplicate: Boolean(r.duplicate), rejects: (r.rejects ?? []) as Json,
      normalization: (r.normalization ?? []) as Json, original_message_xml: r.original_message_xml,
      normalized_message_xml: r.normalized_message_xml ?? null, payload: (r.payload ?? null) as Json,
    })));
    const { error: rowError } = await supabase.from("tally_source_staging_rows")
      .upsert(records, { onConflict: "source_id,idempotency_key,row_sha256", ignoreDuplicates: true });
    if (rowError) throw new Error("Row staging failed; retry this chunk (retries are idempotent).");
    return { chunkId, rows: rows.length, alreadyStaged: Boolean(existing) };
  });

export const getTallySourceStagingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireApprovedAdmin(supabase, userId);
    const { data: sources, error } = await supabase.from("tally_source_staging_sources")
      .select("id, source_company, source_company_guid, isolation_class");
    if (error) throw new Error("Could not read staging status.");
    return Promise.all((sources ?? []).map(async (s) => {
      const [rows, chunks, rejected] = await Promise.all([
        supabase.from("tally_source_staging_rows").select("id", { count: "exact", head: true }).eq("source_id", s.id),
        supabase.from("tally_source_staging_chunks").select("id", { count: "exact", head: true }).eq("source_id", s.id),
        supabase.from("tally_source_staging_rows").select("id", { count: "exact", head: true }).eq("source_id", s.id).neq("rejects", "[]"),
      ]);
      return { ...s, rows: rows.count ?? 0, chunks: chunks.count ?? 0, rowsWithRejects: rejected.count ?? 0 };
    }));
  });
