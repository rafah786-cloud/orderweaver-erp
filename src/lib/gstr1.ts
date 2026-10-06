// GSTR-1 JSON builder (offline-utility schema, B2B + B2CS sections).
// Output matches the format accepted by the GST portal's "Returns Offline Tool".

type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number | null;
  hsn_code?: string | null;
  tax_rate?: number | null;
};

type InvoiceFull = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  party_id: string;
  invoice_items: InvoiceItem[] | null;
};

type Party = {
  id: string;
  name: string;
  gstin: string | null;
  state_code: string | null;
};

const SUPPLIER_STATE_FALLBACK = "29"; // change in profile when known

function fp(year: number, month: number) {
  return `${String(month).padStart(2, "0")}${year}`;
}

function buildItemList(inv: InvoiceFull, isInterState: boolean) {
  // group by tax rate
  const byRate = new Map<number, { taxable: number; igst: number; cgst: number; sgst: number }>();
  for (const it of inv.invoice_items ?? []) {
    const rate = Number(it.tax_rate ?? 18);
    const taxable = Number(it.amount ?? it.quantity * it.unit_price);
    const taxTotal = (taxable * rate) / 100;
    const cur = byRate.get(rate) ?? { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    cur.taxable += taxable;
    if (isInterState) cur.igst += taxTotal;
    else {
      cur.cgst += taxTotal / 2;
      cur.sgst += taxTotal / 2;
    }
    byRate.set(rate, cur);
  }
  return Array.from(byRate.entries()).map(([rate, v], i) => ({
    num: i + 1,
    itm_det: {
      txval: round(v.taxable),
      rt: rate,
      iamt: round(v.igst),
      camt: round(v.cgst),
      samt: round(v.sgst),
      csamt: 0,
    },
  }));
}

const round = (n: number) => Math.round(n * 100) / 100;

export function buildGstr1Json(opts: {
  gstin: string;
  year: number;
  month: number;
  invoices: InvoiceFull[];
  parties: Party[];
  supplierStateCode?: string;
}) {
  const { gstin, year, month, invoices, parties } = opts;
  const supplierState = (opts.supplierStateCode || SUPPLIER_STATE_FALLBACK).padStart(2, "0");
  const partyMap = new Map(parties.map((p) => [p.id, p]));

  const b2b: Record<string, { ctin: string; inv: unknown[] }> = {};
  const b2cs: Record<
    string,
    {
      sply_ty: string;
      rt: number;
      typ: string;
      pos: string;
      txval: number;
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    }
  > = {};

  for (const inv of invoices) {
    const party = partyMap.get(inv.party_id);
    const buyerGstin = party?.gstin?.trim();
    const buyerState = (party?.state_code || supplierState).padStart(2, "0");
    const isInterState = buyerState !== supplierState;
    const items = buildItemList(inv, isInterState);

    if (buyerGstin && /^\d{2}[A-Z0-9]{13}$/.test(buyerGstin)) {
      // B2B
      const ctin = buyerGstin;
      if (!b2b[ctin]) b2b[ctin] = { ctin, inv: [] };
      b2b[ctin].inv.push({
        inum: inv.invoice_number,
        idt: toDDMMYYYY(inv.invoice_date),
        val: round(Number(inv.total_amount)),
        pos: buyerState,
        rchrg: "N",
        inv_typ: "R",
        itms: items,
      });
    } else {
      // B2CS — aggregate per (rate, pos)
      for (const it of items) {
        const key = `${it.itm_det.rt}_${buyerState}_${isInterState ? "INTER" : "INTRA"}`;
        const cur = b2cs[key] ?? {
          sply_ty: isInterState ? "INTER" : "INTRA",
          rt: it.itm_det.rt,
          typ: "OE",
          pos: buyerState,
          txval: 0,
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        };
        cur.txval = round(cur.txval + it.itm_det.txval);
        cur.iamt = round(cur.iamt + it.itm_det.iamt);
        cur.camt = round(cur.camt + it.itm_det.camt);
        cur.samt = round(cur.samt + it.itm_det.samt);
        b2cs[key] = cur;
      }
    }
  }

  return {
    gstin,
    fp: fp(year, month),
    version: "GST3.1.0",
    hash: "hash",
    b2b: Object.values(b2b),
    b2cs: Object.values(b2cs),
  };
}

function toDDMMYYYY(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
