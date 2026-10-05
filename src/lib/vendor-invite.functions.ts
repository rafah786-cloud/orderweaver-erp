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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = randomBytes(24).toString("base64url");
    const { error } = await supabaseAdmin.from("vendor_invites").insert({
      supplier_id: data.supplier_id,
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
      .select("id, supplier_id, email, expires_at, accepted_at")
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

    // Link supplier to this auth user
    const { error: sErr } = await supabaseAdmin
      .from("suppliers")
      .update({ user_id: context.userId })
      .eq("id", row.supplier_id);
    if (sErr) throw new Error(sErr.message);

    // Grant vendor role (idempotent)
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: context.userId, role: "vendor" as any },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );

    // Auto-approve vendor profile
    await supabaseAdmin
      .from("profiles")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: context.userId,
      })
      .eq("id", context.userId);

    // Mark invite accepted
    await supabaseAdmin
      .from("vendor_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", row.id);

    return { ok: true, supplier_id: row.supplier_id };
  });
