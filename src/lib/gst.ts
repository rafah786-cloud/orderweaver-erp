import { sb } from "@/lib/accounting";
import { COMPANY } from "@/lib/print-config";
import { buildGstr1Json } from "@/lib/gstr1";

export type ReturnType = "GSTR-1" | "GSTR-3B" | "GSTR-9";
export type ReturnStatus = "draft" | "generated" | "filed";

export type GstReturn = {
  id: string;
  return_type: ReturnType;
  period_year: number;
  period_month: number | null;
  gstin: string;
  status: ReturnStatus;
  payload: unknown | null;
  summary: GstReturnSummary | null;
  filed_at: string | null;
  filed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type GstReturnSummary = {
  invoice_count?: number;
  b2b_count?: number;
  b2cs_count?: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess?: number;
  total_tax: number;
  total_invoice_value?: number;
};

export type HsnRow = {
  hsn_code: string;
  description: string;
  uqc: string;
  total_qty: number;
  total_value: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  rate: number;
};

export type Gstr3bSummary = {
  // 3.1 Outward supplies
  outward_taxable: number;
  outward_zero_rated: number;
  outward_nil_rated: number;
  outward_inward_rcm: number;
  outward_non_gst: number;
  // 4 ITC
  itc_inputs: number;
  itc_capital: number;
  itc_services: number;
  itc_reversed: number;
  // tax components
  igst_payable: number;
  cgst_payable: number;
  sgst_payable: number;
  igst_itc: number;
  cgst_itc: number;
  sgst_itc: number;
  // 5 Exempt/Nil/Non-GST inward
  inward_exempt: number;
};

type InvoiceFull = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  party_id: string;
  invoice_type: string | null;
  reverse_charge: boolean | null;
  place_of_supply: string | null;
  dispatch_state_code: string | null;
  supplier_gstin: string | null;
  invoice_items: {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number | null;
    hsn_code: string | null;
    tax_rate: number | null;
  }[] | null;
};

type PurchaseFull = {
  id: string;
  bill_number: string;
  bill_date: string;
  total_amount: number;
  subtotal: number | null;
  tax_amount: number | null;
  supplier_id: string | null;
  supplier_gstin: string | null;
  eligibility_for_itc: string | null;
  reverse_charge: boolean | null;
  invoice_type: string | null;
  purchase_bill_items: {
    quantity: number;
    unit_price: number;
    amount: number | null;
  }[] | null;
};

type Party = { id: string; name: string; gstin: string | null; state_code: string | null };

export async function fetchPeriodInvoices(year: number, month: number): Promise<InvoiceFull[]> {
  const from = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const to = new Date(year, month, 0).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("invoices")
    .select("id,invoice_number,invoice_date,total_amount,subtotal,tax_amount,party_id,invoice_type,reverse_charge,place_of_supply,dispatch_state_code,supplier_gstin,invoice_items(description,quantity,unit_price,amount,hsn_code,tax_rate)")
    .gte("invoice_date", from)
    .lte("invoice_date", to);
  if (error) throw error;
  return (data ?? []) as InvoiceFull[];
}

export async function fetchPeriodPurchases(year: number, month: number): Promise<PurchaseFull[]> {
  const from = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const to = new Date(year, month, 0).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("purchase_bills")
    .select("id,bill_number,bill_date,total_amount,subtotal,tax_amount,supplier_id,supplier_gstin,eligibility_for_itc,reverse_charge,invoice_type,purchase_bill_items(quantity,unit_price,amount)")
    .gte("bill_date", from)
    .lte("bill_date", to);
  if (error) throw error;
  return (data ?? []) as PurchaseFull[];
}

export async function fetchPartiesMap(ids: string[]): Promise<Map<string, Party>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await sb.from("parties").select("id,name,gstin,state_code").in("id", ids);
  if (error) throw error;
  return new Map((data as Party[]).map((p) => [p.id, p]));
}

// HSN/SAC summary aggregator — for GSTR-1 Table 12.
export function buildHsnSummary(invoices: InvoiceFull[], parties: Map<string, Party>): HsnRow[] {
  const map = new Map<string, HsnRow>();
  const supplierState = COMPANY.stateCode;
  for (const inv of invoices) {
    const party = parties.get(inv.party_id);
    const buyerState = (party?.state_code || supplierState).padStart(2, "0");
    const isInter = buyerState !== supplierState;
    for (const it of inv.invoice_items ?? []) {
      const code = (it.hsn_code || "9404").toString();
      const rate = Number(it.tax_rate ?? 18);
      const qty = Number(it.quantity ?? 0);
      const taxable = Number(it.amount ?? qty * Number(it.unit_price ?? 0));
      const tax = (taxable * rate) / 100;
      const key = `${code}__${rate}`;
      const cur: HsnRow = map.get(key) ?? {
        hsn_code: code, description: it.description?.slice(0, 60) ?? "",
        uqc: "PCS", total_qty: 0, total_value: 0, taxable_value: 0,
        igst: 0, cgst: 0, sgst: 0, cess: 0, rate,
      };
      cur.total_qty += qty;
      cur.taxable_value += taxable;
      if (isInter) cur.igst += tax; else { cur.cgst += tax / 2; cur.sgst += tax / 2; }
      cur.total_value = cur.taxable_value + cur.igst + cur.cgst + cur.sgst;
      map.set(key, cur);
    }
  }
  return [...map.values()].map((r) => ({
    ...r,
    total_qty: round(r.total_qty),
    taxable_value: round(r.taxable_value),
    total_value: round(r.total_value),
    igst: round(r.igst), cgst: round(r.cgst), sgst: round(r.sgst), cess: round(r.cess),
  })).sort((a, b) => a.hsn_code.localeCompare(b.hsn_code));
}

// GSTR-1 summary (counts, totals) — display-side.
export function summariseGstr1(invoices: InvoiceFull[], parties: Map<string, Party>): GstReturnSummary {
  let b2b = 0, b2cs = 0, taxable = 0, igst = 0, cgst = 0, sgst = 0, totalInv = 0;
  const supplierState = COMPANY.stateCode;
  for (const inv of invoices) {
    const party = parties.get(inv.party_id);
    const isB2b = !!party?.gstin && /^\d{2}[A-Z0-9]{13}$/.test(party.gstin.trim());
    const buyerState = (party?.state_code || supplierState).padStart(2, "0");
    const isInter = buyerState !== supplierState;
    if (isB2b) b2b++; else b2cs++;
    taxable += Number(inv.subtotal ?? 0);
    totalInv += Number(inv.total_amount ?? 0);
    const tax = Number(inv.tax_amount ?? 0);
    if (isInter) igst += tax; else { cgst += tax / 2; sgst += tax / 2; }
  }
  return {
    invoice_count: invoices.length,
    b2b_count: b2b,
    b2cs_count: b2cs,
    taxable_value: round(taxable),
    igst: round(igst), cgst: round(cgst), sgst: round(sgst),
    total_tax: round(igst + cgst + sgst),
    total_invoice_value: round(totalInv),
  };
}

export function buildGstr3b(invoices: InvoiceFull[], purchases: PurchaseFull[], parties: Map<string, Party>): Gstr3bSummary {
  const supplierState = COMPANY.stateCode;
  const s: Gstr3bSummary = {
    outward_taxable: 0, outward_zero_rated: 0, outward_nil_rated: 0,
    outward_inward_rcm: 0, outward_non_gst: 0,
    itc_inputs: 0, itc_capital: 0, itc_services: 0, itc_reversed: 0,
    igst_payable: 0, cgst_payable: 0, sgst_payable: 0,
    igst_itc: 0, cgst_itc: 0, sgst_itc: 0,
    inward_exempt: 0,
  };
  for (const inv of invoices) {
    const party = parties.get(inv.party_id);
    const buyerState = (party?.state_code || supplierState).padStart(2, "0");
    const isInter = buyerState !== supplierState;
    const taxable = Number(inv.subtotal ?? 0);
    const tax = Number(inv.tax_amount ?? 0);
    if (inv.invoice_type === "export" || inv.invoice_type === "sez") s.outward_zero_rated += taxable;
    else if (inv.invoice_type === "bill_of_supply") s.outward_nil_rated += taxable;
    else s.outward_taxable += taxable;
    if (isInter) s.igst_payable += tax; else { s.cgst_payable += tax / 2; s.sgst_payable += tax / 2; }
  }
  for (const pb of purchases) {
    const tax = Number(pb.tax_amount ?? 0);
    const taxable = Number(pb.subtotal ?? 0);
    const elig = pb.eligibility_for_itc ?? "inputs";
    if (elig === "ineligible") { s.itc_reversed += tax; continue; }
    const half = tax / 2;
    if (pb.supplier_gstin && pb.supplier_gstin.startsWith(supplierState)) {
      s.cgst_itc += half; s.sgst_itc += half;
    } else {
      s.igst_itc += tax;
    }
    if (elig === "capital_goods") s.itc_capital += tax;
    else if (elig === "input_services") s.itc_services += tax;
    else s.itc_inputs += tax;
    if (pb.reverse_charge) s.outward_inward_rcm += taxable;
  }
  // round all numbers
  for (const k of Object.keys(s) as (keyof Gstr3bSummary)[]) s[k] = round(s[k] as number);
  return s;
}

const round = (n: number) => Math.round(n * 100) / 100;

export async function generateReturn(opts: {
  type: ReturnType;
  year: number;
  month: number;
  gstin?: string;
}): Promise<{ id: string }> {
  const gstin = opts.gstin || COMPANY.gstin;
  const invoices = await fetchPeriodInvoices(opts.year, opts.month);
  const partyIds = [...new Set(invoices.map((i) => i.party_id))];
  const parties = await fetchPartiesMap(partyIds);

  let payload: unknown = null;
  let summary: GstReturnSummary | Gstr3bSummary | null = null;

  if (opts.type === "GSTR-1") {
    payload = buildGstr1Json({
      gstin, year: opts.year, month: opts.month,
      invoices, parties: [...parties.values()],
      supplierStateCode: COMPANY.stateCode,
    });
    summary = summariseGstr1(invoices, parties);
  } else if (opts.type === "GSTR-3B") {
    const purchases = await fetchPeriodPurchases(opts.year, opts.month);
    const s3b = buildGstr3b(invoices, purchases, parties);
    payload = { gstin, fp: `${String(opts.month).padStart(2, "0")}${opts.year}`, ...s3b };
    summary = {
      invoice_count: invoices.length,
      taxable_value: s3b.outward_taxable + s3b.outward_zero_rated + s3b.outward_nil_rated,
      igst: s3b.igst_payable, cgst: s3b.cgst_payable, sgst: s3b.sgst_payable,
      total_tax: s3b.igst_payable + s3b.cgst_payable + s3b.sgst_payable,
    };
  } else {
    // GSTR-9 annual placeholder — sum 12 months
    summary = { taxable_value: 0, igst: 0, cgst: 0, sgst: 0, total_tax: 0 };
  }

  // Upsert
  const { data, error } = await sb
    .from("gst_returns")
    .upsert(
      {
        return_type: opts.type,
        period_year: opts.year,
        period_month: opts.type === "GSTR-9" ? null : opts.month,
        gstin,
        status: "generated",
        payload,
        summary,
      },
      { onConflict: "return_type,period_year,period_month,gstin" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
