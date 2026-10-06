import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) throw new Error("Forbidden");
}

/**
 * Velocity Shipping — Phase 1: authentication only.
 * The token itself is never returned to the client.
 */
export const testVelocityAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ forceRefresh: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { checkVelocityAuth } = await import("@/lib/velocity/auth.server");
    return checkVelocityAuth(data.forceRefresh ?? false);
  });

/** Phase 2 — pull the live warehouse list from Velocity into the ERP. */
export const syncVelocityWarehouses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const mod = await import("@/lib/velocity/warehouse.server");
    try {
      const { synced } = await mod.syncVelocityWarehouses();
      return { ok: true as const, synced, error: null as string | null, code: null as string | null };
    } catch (e) {
      const err = e as { message?: string; code?: string | null };
      return {
        ok: false as const,
        synced: 0,
        error: err?.message ?? "Velocity warehouse sync failed.",
        code: err?.code ?? null,
      };
    }
  });

/** Warehouses mirrored from Velocity, read from the ERP database. */
export const listVelocityWarehouses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("velocity_warehouses")
      .select(
        "id, velocity_id, name, contact_person, phone, email, address_line1, address_line2, city, state, pincode, country, is_active, last_synced_at",
      )
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
