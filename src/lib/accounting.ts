import { supabase } from "@/integrations/supabase/client";

// New accounting tables aren't in the auto-generated types until regen runs;
// use a typed proxy so we can query them today without `as any` at every call site.
type AnySupabase = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
export const sb = supabase as unknown as AnySupabase;

export function uninstalledAccountingFunction(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return /could not find the function|schema cache|does not exist/i.test(message);
}

export type VoucherType =
  | "sales"
  | "purchase"
  | "receipt"
  | "payment"
  | "contra"
  | "journal"
  | "debit_note"
  | "credit_note"
  | "stock_journal";

export type LedgerNature = "assets" | "liabilities" | "income" | "expenses";

export type LedgerGroup = {
  id: string;
  name: string;
  parent_id: string | null;
  nature: LedgerNature;
  is_system: boolean;
};

export type LedgerAccount = {
  id: string;
  name: string;
  group_id: string;
  opening_balance: number;
  opening_balance_type: "dr" | "cr";
  is_system: boolean;
  is_active: boolean;
  mapped_party_id: string | null;
  mapped_supplier_id: string | null;
  gstin: string | null;
  notes: string | null;
};

export type Voucher = {
  id: string;
  voucher_number: string;
  voucher_type: VoucherType;
  voucher_date: string;
  narration: string | null;
  reference: string | null;
  source_table: string | null;
  source_id: string | null;
  is_locked: boolean;
};

export type VoucherEntry = {
  id: string;
  voucher_id: string;
  ledger_account_id: string;
  cost_center_id: string | null;
  debit: number;
  credit: number;
  narration: string | null;
  line_order: number;
};

export type LedgerBalance = {
  ledger_id: string;
  name: string;
  group_id: string;
  group_name: string;
  nature: LedgerNature;
  opening_balance: number;
  opening_balance_type: "dr" | "cr";
  total_debit: number;
  total_credit: number;
  closing_balance: number;
};

export const VOUCHER_TYPE_LABEL: Record<VoucherType, string> = {
  sales: "Sales",
  purchase: "Purchase",
  receipt: "Receipt",
  payment: "Payment",
  contra: "Contra",
  journal: "Journal",
  debit_note: "Debit Note",
  credit_note: "Credit Note",
  stock_journal: "Stock Journal",
};
