import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hashSyncBatch, validateSyncBatch, type TallySyncRow } from "@/lib/tally-sync";

const sourceSchema = z.object({
  companyId: z.string().uuid(),
  connectorId: z.string().min(1).max(255),
  sourceCompanyGuid: z.string().max(255).nullable().optional(),
  sourceCompanyName: z.string().max(255).nullable().optional(),
});

const batchSchema = z.object({
  sourceId: z.string().uuid(),
  recordType: z.string().min(1).max(64),
  previousAlterId: z.string().regex(/^\d+$/),
  rows: z.array(
    z.object({
      alter_id: z.string().regex(/^\d+$/),
      source_key: z.string().min(1).max(1000),
      source_id: z.string().max(500).nullable().optional(),
      payload_hash: z.string().min(16).max(128),
      payload: z.record(z.string(), z.unknown()),
      lifecycle_state: z.enum(["posted", "cancelled", "optional", "deleted"]).optional(),
    }),
  ).min(1).max(10000),
});

async function requireAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Admin only");
}

export const registerTallySyncSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sourceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: activeCompanyId, error: companyError } =
      await supabase.rpc("current_company_id");
    if (companyError || activeCompanyId !== data.companyId) {
      throw new Error("Source company must be the active company");
    }

    const { data: access, error: accessError } = await supabase
      .from("user_company_access")
      .select("company_id")
      .eq("user_id", userId)
      .eq("company_id", data.companyId)
      .eq("can_view", true)
      .maybeSingle();
    if (accessError || !access) throw new Error("No access to selected company");

    const { data: source, error } = await (supabase as any)
      .from("tally_sync_sources")
      .upsert(
        {
          company_id: data.companyId,
          connector_id: data.connectorId,
          source_company_guid: data.sourceCompanyGuid ?? null,
          source_company_name: data.sourceCompanyName ?? null,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,connector_id" },
      )
      .select("id,company_id,connector_id,status,source_company_guid,source_company_name")
      .single();

    if (error || !source) throw new Error(error?.message || "Could not register Tally sync source");
    return source;
  });

export const getTallySyncWatermark = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      sourceId: z.string().uuid(),
      recordType: z.string().min(1).max(64),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const { data: source, error: sourceError } = await (supabase as any)
      .from("tally_sync_sources")
      .select("company_id")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (sourceError || !source) throw new Error("Unknown Tally sync source");

    const { data: activeCompanyId, error: companyError } =
      await supabase.rpc("current_company_id");
    if (companyError || source.company_id !== activeCompanyId) {
      throw new Error("Sync source is outside the active company");
    }

    const { data: watermark, error } = await (supabase as any)
      .from("tally_sync_watermarks")
      .select("last_alter_id,updated_at")
      .eq("source_id", data.sourceId)
      .eq("record_type", data.recordType)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return {
      lastAlterId: watermark?.last_alter_id?.toString() ?? "0",
      updatedAt: watermark?.updated_at ?? null,
    };
  });

export const acceptTallySyncBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => batchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    const rows = data.rows as TallySyncRow[];
    const validated = validateSyncBatch(data.previousAlterId, data.recordType, rows);

    // The server recomputes the batch hash. The connector cannot choose an
    // arbitrary hash and still receive an accepted watermark advancement.
    const expectedHash = hashSyncBatch(data.recordType, validated.rows);
    if (expectedHash !== validated.payloadHash) {
      throw new Error("Tally sync batch hash mismatch");
    }

    const { data: batchId, error } = await (supabase as any).rpc("accept_tally_sync_batch", {
      p_source_id: data.sourceId,
      p_record_type: data.recordType,
      p_previous_alter_id: validated.previousAlterId,
      p_new_alter_id: validated.newAlterId,
      p_payload_hash: expectedHash,
      p_rows: validated.rows,
    });

    if (error || !batchId) {
      throw new Error(error?.message || "Tally sync batch was not accepted");
    }

    return {
      batchId,
      previousAlterId: validated.previousAlterId,
      newAlterId: validated.newAlterId,
      rowCount: validated.rows.length,
      payloadHash: expectedHash,
    };
  });
