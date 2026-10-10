import { createServerFn } from "@tanstack/react-start";
import { todayIndia } from "@/lib/format";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    if (data.ledger_account_id) {
      const { data: ledger } = await context.supabase
        .from("ledger_accounts")
        .select("id")
        .eq("id", data.ledger_account_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!ledger) throw new Error("Ledger account is outside the active company");
    }
    const { data: row, error } = await context.supabase
      .from("bank_accounts")
      .insert({
        name: data.name,
        bank_name: data.bank_name,
        account_number: data.account_number,
        ifsc_code: data.ifsc_code,
        branch: data.branch,
        account_type: data.account_type,
        currency_code: data.currency_code,
        opening_balance: data.opening_balance,
        opening_balance_date: data.opening_balance_date,
        ledger_account_id: data.ledger_account_id,
        company_id: companyId,
      })
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
    if (!data.bank_account_id) throw new Error("Select a bank account to identify the cheque company");
    const { data: account } = await context.supabase.from("bank_accounts")
      .select("id").eq("id", data.bank_account_id).eq("company_id", companyId).maybeSingle();
    if (!account) throw new Error("Bank account is outside the active company");
    const { data: row, error } = await context.supabase
      .from("cheques")
      .insert({ ...data, status: "pending", created_by: context.userId })
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
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const patch = { status: data.status, ...(data.status === "cleared" ? { cleared_date: todayIndia() } : {}) };
    // Cheque company isolation is enforced by RLS through its linked business records.
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
      ...data, bank_account_id: data.bank_account_id, source: "statement", bank_date: data.txn_date, created_by: context.userId,
    }).select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Failed to add statement line");
    return { id: row.id };
  });

export const unreconcileBankLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reconciled_with: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await hasRole(context.supabase, context.userId, ["admin", "accountant"]);
    const { data: companyId, error: companyError } = await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    const { data: accounts, error: accountError } = await context.supabase.from("bank_accounts")
      .select("id").eq("company_id", companyId);
    if (accountError) throw new Error("Unable to verify bank accounts");
    const accountIds = (accounts ?? []).map((account) => account.id);
    const ids = [data.id, data.reconciled_with].filter(Boolean) as string[];
    const { data: rows, error: readError } = await context.supabase
      .from("bank_transactions")
      .select("id, bank_account_id")
      .in("id", ids)
      .in("bank_account_id", accountIds);
    if (readError) throw new Error(readError.message);
    if ((rows ?? []).length !== ids.length) throw new Error("Bank transaction is outside the active company");
    const { error } = await context.supabase
      .from("bank_transactions")
      .update({ reconciled_at: null, reconciled_with: null })
      .in("id", ids)
      .in("bank_account_id", accountIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const matchBankLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      book_id: z.string().uuid(),
      statement_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await hasRole(context.supabase, context.userId, ["admin", "accountant"]);
    const { data: companyId, error: companyError } =
      await context.supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");
    // Prepared RPC is absent from generated types; retain caller credentials and RLS.
    const { data: result, error } = await (context.supabase as SupabaseClient).rpc("match_bank_lines", {
      p_book: data.book_id,
      p_statement: data.statement_id,
    });
    if (error) throw new Error(error.message);
    return result;
  });
