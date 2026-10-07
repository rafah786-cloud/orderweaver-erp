import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function hasRole(db: any, userId: string, roles: string[]) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).in("role", roles);
  if (!data?.length) throw new Error("Insufficient permissions");
}

const BankAccountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  bank_name: z.string().trim().min(1).max(200),
  account_number: z.string().trim().min(1).max(100),
  ifsc_code: z.string().trim().max(30).nullable().optional(),
  branch: z.string().trim().max(200).nullable().optional(),
  account_type: z.enum(["current", "savings", "od", "cc"]),
  currency_code: z.string().trim().length(3),
  opening_balance: z.number().finite(),
  opening_balance_date: z.string().date(),
  ledger_account_id: z.string().uuid().nullable().optional(),
});

export const createBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BankAccountSchema.parse(d))
  .handler(async ({ data, context }) => {
    await hasRole(context.supabase, context.userId, ["admin", "accountant"]);
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const { data: row, error } = await context.supabase
      .from("bank_accounts")
      .insert({ ...data, company_id: companyId })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create bank account");
    return row.id;
  });

const ChequeSchema = z.object({
  direction: z.enum(["issued", "received"]),
  bank_account_id: z.string().uuid().nullable().optional(),
  cheque_number: z.string().trim().min(1).max(100),
  cheque_date: z.string().date(),
  amount: z.number().finite().positive(),
  party_name: z.string().trim().min(1).max(200),
  bank_name: z.string().trim().max(200).nullable().optional(),
  branch: z.string().trim().max(200).nullable().optional(),
  narration: z.string().trim().max(1000).nullable().optional(),
});

export const createCheque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ChequeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await hasRole(context.supabase, context.userId, ["admin", "accountant"]);
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const { data: row, error } = await context.supabase
      .from("cheques")
      .insert({ ...data, company_id: companyId, status: "pending" })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create cheque");
    return row.id;
  });

export const updateChequeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["cleared", "bounced", "cancelled"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await hasRole(context.supabase, context.userId, ["admin", "accountant"]);
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "cleared") patch.cleared_date = new Date().toISOString().slice(0, 10);
    const { error } = await context.supabase.from("cheques").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BankStatementSchema = z.object({
  bank_account_id: z.string().uuid(),
  txn_date: z.string().date(),
  value_date: z.string().date().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
  debit: z.number().finite().nonnegative(),
  credit: z.number().finite().nonnegative(),
  balance: z.number().finite().nullable().optional(),
});

export const addBankStatementLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => BankStatementSchema.parse(d))
  .handler(async ({ data, context }) => {
    await hasRole(context.supabase, context.userId, ["admin", "accountant"]);
    if (data.debit > 0 && data.credit > 0) throw new Error("A bank line cannot have both debit and credit");
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const { data: account } = await context.supabase.from("bank_accounts").select("id").eq("id", data.bank_account_id).eq("company_id", companyId).maybeSingle();
    if (!account) throw new Error("Bank account is outside the active company");
    const { data: row, error } = await context.supabase.from("bank_transactions").insert({
      ...data, bank_account_id: data.bank_account_id, source: "statement", bank_date: data.txn_date, company_id: companyId,
    }).select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Failed to add statement line");
    return { id: row.id };
  });

export const unreconcileBankLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reconciled_with: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await hasRole(context.supabase, context.userId, ["admin", "accountant"]);
    const ids = [data.id, data.reconciled_with].filter(Boolean) as string[];
    const { error } = await context.supabase.from("bank_transactions").update({ reconciled_at: null, reconciled_with: null }).in("id", ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
