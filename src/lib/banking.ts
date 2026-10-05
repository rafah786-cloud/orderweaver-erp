import { sb } from "./accounting";
export { sb };

export type BankAccount = {
  id: string;
  name: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string | null;
  branch: string | null;
  account_type: string;
  currency_code: string;
  opening_balance: number;
  opening_balance_date: string;
  ledger_account_id: string | null;
  cheque_print_template: any;
  is_active: boolean;
  notes: string | null;
};

export type BankTransaction = {
  id: string;
  bank_account_id: string;
  txn_date: string;
  value_date: string | null;
  description: string | null;
  reference: string | null;
  debit: number;
  credit: number;
  balance: number | null;
  source: "book" | "statement";
  voucher_id: string | null;
  reconciled_at: string | null;
  reconciled_with: string | null;
  bank_date: string | null;
};

export type Cheque = {
  id: string;
  direction: "issued" | "received";
  bank_account_id: string | null;
  cheque_number: string;
  cheque_date: string;
  amount: number;
  party_name: string;
  party_id: string | null;
  supplier_id: string | null;
  bank_name: string | null;
  branch: string | null;
  status: "pending" | "cleared" | "bounced" | "cancelled";
  cleared_date: string | null;
  voucher_id: string | null;
  invoice_id: string | null;
  purchase_bill_id: string | null;
  narration: string | null;
};

export type Currency = {
  code: string;
  name: string;
  symbol: string | null;
  is_base: boolean;
  is_active: boolean;
};
export type ExchangeRate = { id: string; currency_code: string; rate_date: string; rate: number };

export const CHEQUE_STATUS_LABEL: Record<Cheque["status"], string> = {
  pending: "Pending",
  cleared: "Cleared",
  bounced: "Bounced",
  cancelled: "Cancelled",
};
