import { supabase } from "@/integrations/supabase/client";

// New accounting tables aren't in the auto-generated types until regen runs;
// use a typed proxy so we can query them today without `as any` at every call site.
type AnySupabase = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
export const sb = supabase as unknown as AnySupabase;

export type VoucherType =
  | "sales" | "purchase" | "receipt" | "payment"
  | "contra" | "journal" | "debit_note" | "credit_note" | "stock_journal";

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

// Generate next voucher number from the series on the client.
// Server function next_voucher_number is locked down; client computes from current state.
export async function nextVoucherNumber(type: VoucherType): Promise<string> {
  const { data, error } = await sb.from("voucher_number_series").select("*").eq("voucher_type", type).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No number series for ${type}`);
  const num = String(data.next_number).padStart(data.width ?? 4, "0");
  const result = `${data.prefix ?? ""}${num}${data.suffix ?? ""}`;
  // Bump
  await sb.from("voucher_number_series").update({ next_number: data.next_number + 1 }).eq("voucher_type", type);
  return result;
}

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
