import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLE_BY_TABLE: Record<string, string[]> = {
  work_centers: ["admin", "production"],
  mps_plans: ["admin", "production"],
  routings: ["admin", "production"],
  mrp_runs: ["admin", "production"],
  production_operations: ["admin", "production"],
  quality_plans: ["admin", "production"],
  quality_inspections: ["admin", "production"],
  quality_nonconformances: ["admin", "production"],
  maintenance_assets: ["admin", "production"],
  maintenance_plans: ["admin", "production"],
  maintenance_work_orders: ["admin", "production"],
  bom_revisions: ["admin", "production"],
  engineering_change_orders: ["admin", "production"],
  rfqs: ["admin", "production", "sales"],
  supplier_quotes: ["admin", "production", "sales"],
  warehouse_zones: ["admin", "production"],
  warehouse_bins: ["admin", "production"],
  stock_counts: ["admin", "production"],
  landed_cost_vouchers: ["admin", "accountant"],
  budgets: ["admin", "accountant"],
  bank_reconciliations: ["admin", "accountant"],
  fixed_assets: ["admin", "accountant"],
  crm_leads: ["admin", "sales"],
  crm_opportunities: ["admin", "sales"],
  crm_activities: ["admin", "sales"],
  shipments: ["admin", "sales", "production"],
  sales_returns: ["admin", "sales"],
  projects: ["admin", "sales", "production"],
  project_tasks: ["admin", "sales", "production"],
  workflow_definitions: ["admin"],
  workflow_instances: ["admin"],
  data_quality_issues: ["admin"],
  ai_data_freshness: ["admin"],
};

const TABLES = new Set(Object.keys(ROLE_BY_TABLE));
const INPUT = z.object({
  table: z.string().min(1).max(80),
  action: z.enum(["create", "update", "delete", "status"]),
  id: z.string().uuid().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

async function rolesOf(supabase: any): Promise<string[]> {
  const { data } = await supabase.rpc("current_user_roles");
  return ((data ?? []) as any[]).map((r) => typeof r === "string" ? r : r.role).filter(Boolean);
}

function isProtectedStatus(status: unknown): boolean {
  return [
    "approved", "released", "closed", "locked", "reconciled", "completed",
    "posted", "awarded", "dispatched", "delivered",
  ].includes(String(status ?? ""));
}

export const enterpriseWorkbenchMutation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => INPUT.parse(input))
  .handler(async ({ data, context }) => {
    if (!TABLES.has(data.table)) throw new Error("This enterprise entity is not writable through the workbench.");

    const roles = await rolesOf(context.supabase);
    const allowed = ROLE_BY_TABLE[data.table] ?? [];
    if (!roles.some((r) => allowed.includes(r))) {
      throw new Error("You do not have permission to modify this enterprise entity.");
    }

    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected.");

    const db = context.supabase as any;
    const payload = { ...data.payload };
    delete payload.company_id;
    delete payload.id;

    let before: Record<string, unknown> | null = null;
    if (data.action !== "create") {
      if (!data.id) throw new Error("A record id is required.");
      const { data: existing, error } = await db
        .from(data.table)
        .select("*")
        .eq("id", data.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error || !existing) throw new Error("Record is not available in the active company.");
      before = existing;

      if (data.action === "delete" && !roles.includes("admin") && isProtectedStatus(existing.status)) {
        throw new Error("Protected lifecycle records can only be deleted by an administrator.");
      }
      if (data.action === "delete" && existing.status && !["draft", "cancelled", "rejected", "open", "new"].includes(String(existing.status)) && !roles.includes("admin")) {
        throw new Error("Only unposted/unreleased records may be deleted.");
      }
    }

    let result: Record<string, unknown> | null = null;
    if (data.action === "create") {
      const { data: created, error } = await db
        .from(data.table)
        .insert({ ...payload, company_id: companyId })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      result = created;
    } else if (data.action === "update" || data.action === "status") {
      if (!data.id) throw new Error("A record id is required.");
      if (data.action === "status") {
        const status = payload.status;
        if (status == null) throw new Error("A status is required.");
        Object.keys(payload).forEach((key) => { if (key !== "status") delete payload[key]; });
      }
      const { data: updated, error } = await db
        .from(data.table)
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      result = updated;
    } else {
      if (!data.id) throw new Error("A record id is required.");
      const { error } = await db
        .from(data.table)
        .delete()
        .eq("id", data.id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    }

    const { error: auditError } = await db.from("erp_domain_audit_log").insert({
      company_id: companyId,
      module: "enterprise_workbench",
      entity_type: data.table,
      entity_id: data.id ?? result?.id ?? null,
      action: data.action,
      before_data: before,
      after_data: result,
      reason: data.action === "status" ? `Lifecycle status changed to ${String(payload.status)}` : "Enterprise workbench mutation",
      actor_id: context.userId,
    });
    if (auditError) throw new Error("The record changed but the audit record could not be written. The operation was not safely completed.");

    return { ok: true as const, companyId, record: result };
  });
