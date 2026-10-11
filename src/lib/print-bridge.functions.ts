import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(db: any, userId: string) {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  if (error || !data?.length) throw new Error("Administrator permission is required.");
}

export const listProductionPrintDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("Select an active company first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db: any = supabaseAdmin;
    const { data, error } = await db.from("production_print_devices")
      .select("id,name,is_active,last_seen_at,created_at")
      .eq("company_id", companyId).order("created_at", { ascending: false });
    if (error) throw new Error("Could not load paired printers.");
    return data ?? [];
  });

export const registerProductionPrintDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("Select an active company before pairing the printer.");

    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db: any = supabaseAdmin;
    const { data: device, error } = await db.from("production_print_devices").insert({
      company_id: companyId, name: data.name, token_hash: tokenHash, created_by: context.userId,
    }).select("id,name,created_at").single();
    if (error || !device) throw new Error("Printer pairing could not be saved. The order workflow remains available.");
    return { id: device.id as string, name: device.name as string, token };
  });

export const deactivateProductionPrintDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ device_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("Select an active company first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db: any = supabaseAdmin;
    const { data: device, error } = await db.from("production_print_devices")
      .update({ is_active: false })
      .eq("id", data.device_id).eq("company_id", companyId).select("id").maybeSingle();
    if (error || !device) throw new Error("The printer device could not be deactivated.");
    return { ok: true };
  });

export const retryProductionPrintJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    job_id: z.string().uuid(),
    force_review: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles")
      .select("role").eq("user_id", context.userId).in("role", ["admin", "production"]);
    if (roleError || !roles?.length) throw new Error("Production print access is required.");
    const db: any = context.supabase;
    const { data: newId, error } = await db.rpc("retry_production_print_job", {
      p_job_id: data.job_id, p_force_review: data.force_review,
    });
    if (error || !newId) throw new Error("The print job could not be requeued. Verify its status and permissions.");
    return { id: newId as string };
  });
