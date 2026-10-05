import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rowSchema = z.object({
  record_type: z.string().min(1).max(64),
  source_id: z.string().max(500).nullable().optional(),
  alter_id: z.string().max(200).nullable().optional(),
  source_key: z.string().min(1).max(1000),
  lifecycle_state: z.enum(["posted", "cancelled", "optional", "deleted"]).default("posted"),
  parent_source_key: z.string().max(1000).nullable().optional(),
  payload: z.record(z.unknown()),
});

const inputSchema = z.object({
  companyId: z.string().uuid(),
  sourceCompanyName: z.string().max(255).nullable().optional(),
  sourceCompanyGuid: z.string().max(255).nullable().optional(),
  sourceChecksum: z.string().min(16).max(128),
  controlTotals: z.record(z.unknown()),
  rows: z.array(rowSchema).max(50000),
});

export const stageTallyMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Admin only");

    const { data: access } = await supabase
      .from("user_company_access")
      .select("company_id")
      .eq("user_id", userId)
      .eq("company_id", data.companyId)
      .eq("can_view", true)
      .maybeSingle();
    if (!access) throw new Error("No access to selected company");

    const { data: run, error: runError } = await supabase
      .from("tally_migration_runs")
      .insert({
        company_id: data.companyId,
        source_company_name: data.sourceCompanyName ?? null,
        source_company_guid: data.sourceCompanyGuid ?? null,
        source_checksum: data.sourceChecksum,
        control_totals: data.controlTotals,
        created_by: userId,
        status: "staged",
      })
      .select("id")
      .single();
    if (runError || !run) throw new Error(runError?.message || "Could not create migration run");

    const rows = data.rows.map((r) => ({
      run_id: run.id,
      company_id: data.companyId,
      record_type: r.record_type,
      source_id: r.source_id ?? null,
      alter_id: r.alter_id ?? null,
      source_key: r.source_key,
      payload_hash: createHash("sha256").update(JSON.stringify(r.payload)).digest("hex"),
      payload: r.payload,
      lifecycle_state: r.lifecycle_state,
      parent_source_key: r.parent_source_key ?? null,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("tally_migration_rows").insert(rows.slice(i, i + 500));
      if (error) throw new Error("Could not stage migration rows: " + error.message);
    }

    return { runId: run.id, rowCount: rows.length, checksum: data.sourceChecksum };
  });

export const listTallyMigrationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Admin only");
    const { data, error } = await supabase
      .from("tally_migration_runs")
      .select(
        "id,company_id,source_company_name,source_company_guid,status,source_checksum,started_at,completed_at,created_by,approved_by,approved_at,notes,control_totals",
      )
      .order("started_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const validateTallyMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Admin only");
    const { data: result, error } = await supabase.rpc("validate_tally_migration_run", {
      p_run: data.runId,
    });
    if (error) throw error;
    return result?.[0] ?? null;
  });

export const reconcileTallyMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ runId: z.string().uuid(), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Admin only");
    const { data: rows, error } = await supabase.rpc("reconcile_tally_migration_run", {
      p_run: data.runId,
      p_as_of: data.asOf,
    });
    if (error) throw error;
    return rows ?? [];
  });
