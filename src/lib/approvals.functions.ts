import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Assignable roles surfaced in the User Approvals UI.
// Labels (Admin/Management, Accounts, Sales, Production, Customers, Vendors, HR, Employee)
// map to these underlying enum values.
const ROLE_VALUES = [
  "admin",
  "accountant",
  "sales",
  "production",
  "customer",
  "vendor",
  "hr",
  "employee",
] as const;
const STATUS_VALUES = ["pending", "approved", "rejected"] as const;

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin only");
}

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), status: z.enum(STATUS_VALUES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        status: data.status,
        approved_at: data.status === "approved" ? new Date().toISOString() : null,
        approved_by: context.userId,
      })
      .eq("id", data.user_id);
    if (error) {
      console.error("[approvals] setUserStatus", error);
      throw new Error("Failed to update user status");
    }
    return { ok: true };
  });

export const assignUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), role: z.enum(ROLE_VALUES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error && !/duplicate key/i.test(error.message)) {
      console.error("[approvals] assignUserRole", error);
      throw new Error("Failed to assign role");
    }
    return { ok: true };
  });

export const removeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), role: z.enum(ROLE_VALUES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Prevent admins removing their own last admin role (lockout protection)
    if (data.user_id === context.userId && data.role === "admin") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) throw new Error("Cannot remove the last admin role");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) {
      console.error("[approvals] removeUserRole", error);
      throw new Error("Failed to remove role");
    }
    return { ok: true };
  });
