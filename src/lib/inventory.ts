import { sb } from "./accounting";

export { sb };

export type ValuationMethod = "fifo" | "lifo" | "weighted_avg" | "standard_cost";
export type StockMovementType =
  | "purchase" | "sale" | "production_in" | "production_out"
  | "transfer_in" | "transfer_out" | "adjustment" | "opening";

export type Godown = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  parent_id: string | null;
  is_active: boolean;
};

export type StockItem = {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  alternate_unit: string | null;
  conversion_factor: number;
  hsn_code: string | null;
  gst_rate: number;
  valuation_method: ValuationMethod;
  reorder_level: number;
  reorder_quantity: number;
  min_stock: number;
  max_stock: number | null;
  standard_cost: number;
  standard_price: number;
  track_batches: boolean;
  mapped_raw_material_id: string | null;
  mapped_model_id: string | null;
  is_active: boolean;
  notes: string | null;
};

export type StockBatch = {
  id: string;
  stock_item_id: string;
  batch_number: string;
  mfg_date: string | null;
  expiry_date: string | null;
  godown_id: string | null;
  opening_qty: number;
  opening_rate: number;
};

export type StockMovement = {
  id: string;
  movement_date: string;
  stock_item_id: string;
  batch_id: string | null;
  godown_id: string | null;
  movement_type: StockMovementType;
  quantity: number;
  rate: number;
  amount: number;
  source_table: string | null;
  source_id: string | null;
  voucher_id: string | null;
  narration: string | null;
};

export type StockSummaryRow = {
  stock_item_id: string;
  name: string;
  code: string | null;
  unit: string;
  reorder_level: number;
  min_stock: number;
  max_stock: number | null;
  current_qty: number;
  avg_rate: number;
  stock_value: number;
};

export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  purchase: "Purchase",
  sale: "Sale",
  production_in: "Production In",
  production_out: "Production Out",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  adjustment: "Adjustment",
  opening: "Opening",
};

export const VALUATION_LABEL: Record<ValuationMethod, string> = {
  fifo: "FIFO",
  lifo: "LIFO",
  weighted_avg: "Weighted Average",
  standard_cost: "Standard Cost",
};

export async function nextStockJournalNumber(): Promise<string> {
  const { data } = await sb.from("stock_journals").select("journal_number").order("created_at", { ascending: false }).limit(1);
  const last = data?.[0]?.journal_number as string | undefined;
  let next = 1;
  if (last) {
    const m = last.match(/(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `SJ/${String(next).padStart(4, "0")}`;
}
