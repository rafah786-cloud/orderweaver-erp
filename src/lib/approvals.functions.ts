import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkAccessChange } from "@/lib/access-policy";
type AdminClient = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

const ROLE_VALUES = ["admin", "accountant", "sales", "production", "customer", "vendor", "hr", "employee"] as const;
const STATUS_VALUES = ["pending", "approved", "rejected"] as const;

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: profile, error: profileError }, { data: role, error: roleError }] = await Promise.all([
    supabaseAdmin.from("profiles").select("status").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
  ]);
  if (profileError || roleError) {
    console.error("[approvals] administrator verification failed");
    throw new Error("Failed to verify administrator access");
  }
  if (profile?.status !== "approved" || !role) throw new Error("Approved administrator access required");
}

async function getApprovedAdminCount(supabaseAdmin: AdminClient): Promise<number> {
  const { data: adminRoles, error: rolesError } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  if (rolesError || !adminRoles) throw new Error("Failed to verify active administrators");
  const ids = [...new Set(adminRoles.map((row) => row.user_id))];
  if (ids.length === 0) return 0;
  const { data: profiles, error: profilesError } = await supabaseAdmin.from("profiles").select("id").in("id", ids).eq("status", "approved");
  if (profilesError || !profiles) throw new Error("Failed to verify active administrators");
  return profiles.length;
}

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), status: z.enum(STATUS_VALUES) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetRoles, error: roleError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id);
    if (roleError || !targetRoles) {
      console.error("[approvals] approval role check failed");
      throw new Error("Failed to verify user roles");
    }
    const policyError = checkAccessChange({ kind: "status", actorId: context.userId, targetId: data.user_id, status: data.status, targetRoleCount: targetRoles.length });
    if (policyError) throw new Error(policyError);
    const { error } = await supabaseAdmin.from("profiles").update({ status: data.status, approved_by: context.userId }).eq("id", data.user_id);
    if (error) {
      console.error("[approvals] setUserStatus failed");
      throw new Error("Failed to update user status");
    }
    return { ok: true };
  });

export const assignUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), role: z.enum(ROLE_VALUES) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const policyError = checkAccessChange({ kind: "assign-role", actorId: context.userId, targetId: data.user_id, role: data.role });
    if (policyError) throw new Error(policyError);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    if (error && !/duplicate key/i.test(error.message)) {
      console.error("[approvals] assignUserRole failed");
      throw new Error("Failed to assign role");
    }
    return { ok: true };
  });

export const removeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), role: z.enum(ROLE_VALUES) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin.from("profiles").select("status").eq("id", data.user_id).maybeSingle();
    if (targetProfileError) {
      console.error("[approvals] target profile lookup failed");
      throw new Error("Failed to verify target user");
    }
    const { data: targetRoles, error: targetRolesError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id);
    if (targetRolesError || !targetRoles) {
      console.error("[approvals] target role lookup failed");
      throw new Error("Failed to verify target roles");
    }
    if (targetProfile?.status === "approved" && targetRoles.length <= 1) {
      throw new Error("Assign another role or reject the user before removing the last role");
    }
    if (data.role === "admin") {
      const policyError = checkAccessChange({
        kind: "remove-role",
        actorId: context.userId,
        targetId: data.user_id,
        role: data.role,
        adminCount: await getApprovedAdminCount(supabaseAdmin),
      });
      if (policyError) throw new Error(policyError);
    }
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", data.role);
    if (error) {
      console.error("[approvals] removeUserRole failed");
      throw new Error("Failed to remove role");
    }
    return { ok: true };
  });

export const setUserCompanyAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), company_ids: z.array(z.string().uuid()).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: access, error } = await context.supabase.rpc("set_user_company_access", { p_user_id: data.user_id, p_company_ids: data.company_ids });
    if (error) {
      console.error("[approvals] setUserCompanyAccess failed");
      throw new Error("Failed to update company access");
    }
    return { ok: true, access: access ?? [] };
  });
