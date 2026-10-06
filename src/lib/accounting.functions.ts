import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const voucherType = z.enum([
  "sales",
  "purchase",
  "receipt",
  "payment",
  "contra",
  "journal",
  "debit_note",
  "credit_note",
  "stock_journal",
]);
const entry = z.object({
  ledger_account_id: z.string().uuid(),
  cost_center_id: z.string().uuid().nullable().optional(),
  debit: z.number().nonnegative(),
  credit: z.number().nonnegative(),
  narration: z.string().max(500).optional(),
  line_order: z.number().int().positive().optional(),
});
type RpcRow = Record<string, string | number | boolean | null>;
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: RpcRow | RpcRow[] | null; error: { message: string } | null }>;
};
const rpc = (value: unknown) => value as RpcClient;

async function assertAccountingRole(db: any, userId: string, allowed: string[] = ["admin", "accountant"]) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", allowed);
  if (error || !data?.some((row: { role?: string }) => allowed.includes(row.role ?? ""))) {
    throw new Error("You do not have permission to perform this accounting action.");
  }
}

export const createGlVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z
      .object({
        type: voucherType,
        date: z.string().date(),
        entries: z.array(entry).min(2),
        narration: z.string().max(2000).optional(),
        reference: z.string().max(200).optional(),
        idempotencyKey: z.string().min(8).max(200),
        status: z.enum(["draft", "posted"]).default("posted"),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertAccountingRole(context.supabase, context.userId);
    const result = await rpc(context.supabase).rpc("create_gl_voucher", {
      _type: data.type,
      _date: data.date,
      _entries: data.entries,
      _narration: data.narration ?? null,
      _reference: data.reference ?? null,
      _idempotency_key: data.idempotencyKey,
      _status: data.status,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const cancelGlVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z
      .object({ id: z.string().uuid(), date: z.string().date(), reason: z.string().trim().min(3) })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertAccountingRole(context.supabase, context.userId);
    const result = await rpc(context.supabase).rpc("cancel_gl_voucher", {
      _id: data.id,
      _date: data.date,
      _reason: data.reason,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const reverseGlVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z
      .object({ id: z.string().uuid(), date: z.string().date(), reason: z.string().trim().min(3) })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertAccountingRole(context.supabase, context.userId);
    const result = await rpc(context.supabase).rpc("reverse_gl_voucher", {
      _id: data.id,
      _date: data.date,
      _reason: data.reason,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const closeFinancialYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ id: z.string().uuid() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertAccountingRole(context.supabase, context.userId);
    const result = await rpc(context.supabase).rpc("close_financial_year", { _id: data.id });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const reopenFinancialYear = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(3) }).parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertAccountingRole(context.supabase, context.userId, ["admin"]);
    const result = await rpc(context.supabase).rpc("reopen_financial_year", {
      _id: data.id,
      _reason: data.reason,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });
