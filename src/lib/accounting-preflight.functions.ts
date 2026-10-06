import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Admin only");
  return true;
}

// These read-only checks include optional tables absent from the generated schema until migrations run.
const probe = async (db: SupabaseClient, table: string, columns: string) => {
  const { error } = await db.from(table).select(columns).limit(1);
  return error ? error.message : "columns present";
};

const countOf = async (db: SupabaseClient, table: string) => {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true });
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0, error: null };
};

async function sumColumn(db: SupabaseClient, table: string, column: string) {
  let from = 0;
  let total = 0;
  let rows = 0;
  let nonzero = 0;
  for (;;) {
    const { data, error } = await db
      .from(table)
      .select(column)
      .range(from, from + 999);
    if (error) return { total: null, rows, nonzero, error: error.message };
    const batch = data ?? [];
    for (const row of batch) {
      const value = Number(Object.values(row)[0] ?? 0);
      total += value;
      rows += 1;
      if (value !== 0) nonzero += 1;
    }
    if (batch.length < 1000) break;
    from += 1000;
  }
  return { total, rows, nonzero, error: null };
}

export const accountingPreflight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { data: companyId, error: companyError } = await db.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const vouchers = await db
      .from("vouchers")
      .select("id, voucher_number, voucher_type")
      .eq("company_id", companyId);
    const entries = await db.from("voucher_entries").select("voucher_id, debit, credit");
    const byVoucher = new Map<string, { debit: number; credit: number }>();
    let debit = 0;
    let credit = 0;
    for (const row of entries.data ?? []) {
      const d = Number(row.debit ?? 0);
      const c = Number(row.credit ?? 0);
      debit += d;
      credit += c;
      const current = byVoucher.get(row.voucher_id) ?? { debit: 0, credit: 0 };
      current.debit += d;
      current.credit += c;
      byVoucher.set(row.voucher_id, current);
    }
    const unbalanced = [...byVoucher.entries()].filter(
      ([, v]) => Math.abs(v.debit - v.credit) > 0.009,
    ).length;
    const numbers = new Map<string, number>();
    for (const row of vouchers.data ?? []) {
      const key = `${row.voucher_type}:${row.voucher_number}`;
      numbers.set(key, (numbers.get(key) ?? 0) + 1);
    }
    const duplicateNumbers = [...numbers.entries()]
      .filter(([, n]) => n > 1)
      .map(([key, count]) => ({ key, count }));
    const series = await db
      .from("voucher_number_series")
      .select("voucher_type, prefix, next_number")
      .eq("company_id", companyId);
    const years = await db
      .from("financial_years")
      .select("name, start_date, end_date, is_current, is_locked")
      .eq("company_id", companyId)
      .order("start_date");
    const yearRows = years.data ?? [];
    const overlaps = yearRows.filter((year, index) =>
      yearRows.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          year.start_date <= other.end_date &&
          other.start_date <= year.end_date,
      ),
    ).length;
    const bills = await countOf(db, "bills");
    const allocations = await countOf(db, "bill_allocations");
    const stock = await sumColumn(db, "raw_materials", "current_stock");
    const invoicePaid = await sumColumn(db, "invoices", "paid_amount");
    const invoiceTotal = await sumColumn(db, "invoices", "total_amount");
    return {
      vouchers: { count: vouchers.data?.length ?? 0, error: vouchers.error?.message ?? null },
      entries: { count: entries.data?.length ?? 0, error: entries.error?.message ?? null },
      debit,
      credit,
      unbalancedVouchers: unbalanced,
      duplicateVoucherNumbers: duplicateNumbers,
      voucherSeries: series.data ?? [],
      voucherSeriesError: series.error?.message ?? null,
      customerOutstanding: await sumColumn(db, "parties", "current_balance"),
      supplierOutstanding: await sumColumn(db, "suppliers", "current_balance"),
      invoicePaid,
      invoiceTotal,
      invoiceOutstanding:
        invoicePaid.total != null && invoiceTotal.total != null
          ? invoiceTotal.total - invoicePaid.total
          : null,
      purchases: await countOf(db, "purchase_bills"),
      bills,
      billAllocations: allocations,
      billColumns: await probe(db, "bills", "party_kind, party_id, original_amount, external_ref"),
      billAllocationColumns: await probe(db, "bill_allocations", "id, bill_id, amount"),
      stockMovementColumns: await probe(
        db,
        "stock_movements",
        "stock_item_id, movement_type, quantity, narration",
      ),
      rawMaterialStockQuantity: stock,
      stockMovements: await countOf(db, "stock_movements"),
      financialYears: yearRows,
      financialYearOverlaps: overlaps,
      financialYearError: years.error?.message ?? null,
      companyId,
      directWriteGrants: "not readable from the application role",
    };
  });
