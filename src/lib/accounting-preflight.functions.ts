import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

async function adminDb(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin only");
  return supabaseAdmin;
}

const countOf = async (db: Awaited<ReturnType<typeof adminDb>>, table: keyof Database["public"]["Tables"]) => {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0, error: null };
};

export const accountingPreflight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb(context.userId);
    const vouchers = await countOf(db, "vouchers");
    const entries = await db.from("voucher_entries").select("debit, credit");
    const debit = (entries.data ?? []).reduce((s, r) => s + Number(r.debit ?? 0), 0);
    const credit = (entries.data ?? []).reduce((s, r) => s + Number(r.credit ?? 0), 0);
    return {
      vouchers,
      entryError: entries.error?.message ?? null,
      debit,
      credit,
      invoices: await countOf(db, "invoices"),
      purchases: await countOf(db, "purchase_bills"),
      parties: await countOf(db, "parties"),
      suppliers: await countOf(db, "suppliers"),
      financialYears: await countOf(db, "financial_years"),
      stockMovements: await countOf(db, "stock_movements"),
      rawMaterials: await countOf(db, "raw_materials"),
    };
  });
