import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHash, randomBytes } from "crypto";

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

function hashToken(t: string) {
  return createHash("sha256").update(t).digest("hex");
}

export const createVendorInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        supplier_id: z.string().uuid(),
        email: z.string().email(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: companyId, error: companyError } =
      await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");

    // Supplier selection is resolved through the caller's RLS so an admin
    // cannot create an invite for a supplier from another company.
    const { data: supplier, error: supplierError } = await context.supabase
      .from("suppliers")
      .select("id, company_id")
      .eq("id", data.supplier_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (supplierError || !supplier) throw new Error("Supplier not found in the active company");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = randomBytes(24).toString("base64url");
    const { error } = await supabaseAdmin.from("vendor_invites").insert({
      supplier_id: supplier.id,
      email: data.email.toLowerCase(),
      token_hash: hashToken(token),
      invited_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

export const lookupVendorInvite = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("vendor_invites")
      .select("id, supplier_id, email, expires_at, accepted_at, suppliers(name)")
      .eq("token_hash", hashToken(data.token))
      .maybeSingle();
    if (!row) throw new Error("Invalid invite");
    if (row.accepted_at) throw new Error("Invite already used");
    if (new Date(row.expires_at) < new Date()) throw new Error("Invite expired");
    return {
      email: row.email,
      supplier_id: row.supplier_id,
      supplier_name: (row as any).suppliers?.name ?? null,
    };
  });

export const claimVendorInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("vendor_invites")
      .select("id, supplier_id, email, expires_at, accepted_at, invited_by")
      .eq("token_hash", hashToken(data.token))
      .maybeSingle();
    if (!row) throw new Error("Invalid invite");
    if (row.accepted_at) throw new Error("Invite already used");
    if (new Date(row.expires_at) < new Date()) throw new Error("Invite expired");

    // Verify the calling user's email matches the invite target
    const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (uErr || !userRes?.user?.email) throw new Error("Could not verify account email");
    if (userRes.user.email.toLowerCase() !== row.email.toLowerCase()) {
      throw new Error("Invite email does not match your account");
    }

    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("id, company_id, user_id")
      .eq("id", row.supplier_id)
      .maybeSingle();
    if (!supplier?.company_id) throw new Error("Supplier company is unavailable");
    if (supplier.user_id && supplier.user_id !== context.userId) {
      throw new Error("This supplier account is already linked");
    }

    // Link the supplier only when it is still unclaimed.
    const { data: linkedSupplier, error: sErr } = await supabaseAdmin
      .from("suppliers")
      .update({ user_id: context.userId })
      .eq("id", row.supplier_id)
      .is("user_id", null)
      .select("id, company_id")
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    // The first successful claimant owns the supplier. A concurrent claim must fail
    // rather than granting a second account access to the supplier company.
    if (!linkedSupplier) throw new Error("This supplier account has already been claimed");
    if (linkedSupplier.company_id !== supplier.company_id) {
      throw new Error("Supplier company changed during claim");
    }

    // Vendor access is explicitly bound to the supplier's company.
    const { error: accessErr } = await supabaseAdmin
      .from("user_company_access")
      .upsert(
        { user_id: context.userId, company_id: supplier.company_id, can_view: true },
        { onConflict: "user_id,company_id" },
      );
    if (accessErr) throw new Error(accessErr.message);

    // Grant vendor role (idempotent)
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: context.userId, role: "vendor" as any },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (roleErr) throw new Error(roleErr.message);

    // Put the invited vendor into the supplier's company after membership is granted.
    const { error: activeErr } = await supabaseAdmin
      .from("profiles")
      .update({
        active_company_id: supplier.company_id,
        status: "approved",
        approved_by: row.invited_by ?? null,
      })
      .eq("id", context.userId);
    if (activeErr) throw new Error(activeErr.message);

    // Mark invite accepted.
    const { error: inviteErr } = await supabaseAdmin
      .from("vendor_invites")
      .update({ invited_by: row.invited_by })
      .eq("id", row.id)
      .is("accepted_at", null);
    if (inviteErr) throw new Error(inviteErr.message);

    return { ok: true, supplier_id: row.supplier_id, company_id: supplier.company_id };
  });
