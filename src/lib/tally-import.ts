import { XMLParser } from "fast-xml-parser";

export type TallyParty = {
  name: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  state_code?: string | null;
  pin_code?: string | null;
  opening_balance: number; // positive = Dr, negative = Cr
};

export type TallyStockItem = {
  name: string;
  unit: string;
  opening_qty: number;
  opening_rate: number;
  group: string; // PARENT
};

export type TallyParsed = {
  customers: TallyParty[];
  vendors: TallyParty[];
  rawMaterials: TallyStockItem[];
  finishedGoods: TallyStockItem[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

function arr<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    // Tally often wraps text in { "#text": "..." } when attributes exist
    const t = (v as Record<string, unknown>)["#text"];
    if (typeof t === "string") return t.trim();
  }
  return "";
}

function num(v: unknown): number {
  const s = text(v).replace(/,/g, "").trim();
  if (!s) return 0;
  // Tally negative balances are sometimes "(-)1234.56" or "-1234.56"
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

function parseQtyUnit(raw: string): { qty: number; unit: string } {
  const s = raw.trim();
  if (!s) return { qty: 0, unit: "" };
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)?/);
  return { qty: m ? parseFloat(m[1]) : 0, unit: m?.[2] ?? "" };
}

function parseRate(raw: string): number {
  // e.g. "100.00/Nos" or "100.00"
  const s = raw.split("/")[0]?.trim() ?? "";
  return num(s);
}

function flattenAddress(v: unknown): string {
  if (!v) return "";
  // ADDRESS.LIST -> ADDRESS -> string | string[]
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  const obj = v as Record<string, unknown>;
  const inner = obj.ADDRESS ?? obj["#text"];
  if (Array.isArray(inner)) return inner.map(text).filter(Boolean).join(", ");
  return text(inner);
}

function parentMatches(parent: string, patterns: string[]): boolean {
  const p = parent.toLowerCase();
  return patterns.some((pat) => p.includes(pat.toLowerCase()));
}

export function parseTallyMasters(
  xml: string,
  opts: { rawGroups: string[]; finishedGroups: string[] }
): TallyParsed {
  const json = parser.parse(xml);

  // Walk to TALLYMESSAGE array
  const messages = arr<Record<string, unknown>>(
    json?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE ?? json?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE
  );

  const customers: TallyParty[] = [];
  const vendors: TallyParty[] = [];
  const rawMaterials: TallyStockItem[] = [];
  const finishedGoods: TallyStockItem[] = [];

  for (const msg of messages) {
    const ledgers = arr<Record<string, unknown>>(msg.LEDGER as Record<string, unknown> | Record<string, unknown>[] | undefined);
    for (const l of ledgers) {
      const name = text(l["@_NAME"] ?? l.NAME);
      if (!name) continue;
      const parent = text(l.PARENT).toLowerCase();

      const isCustomer = parent.includes("sundry debtor") || parent.includes("debtor");
      const isVendor = parent.includes("sundry creditor") || parent.includes("creditor");
      if (!isCustomer && !isVendor) continue;

      const party: TallyParty = {
        name,
        gstin: text(l.PARTYGSTIN ?? l.GSTREGISTRATIONNUMBER) || null,
        phone: text(l.LEDGERPHONE ?? l.LEDGERMOBILE) || null,
        email: text(l.EMAIL) || null,
        address: flattenAddress(l["ADDRESS.LIST"]) || null,
        state_code: text(l.LEDSTATENAME) || null,
        pin_code: text(l.PINCODE) || null,
        opening_balance: num(l.OPENINGBALANCE),
      };
      (isCustomer ? customers : vendors).push(party);
    }

    const items = arr<Record<string, unknown>>(msg.STOCKITEM);
    for (const it of items) {
      const name = text(it["@_NAME"] ?? it.NAME);
      if (!name) continue;
      const parent = text(it.PARENT);
      const openBalRaw = text(it.OPENINGBALANCE);
      const { qty, unit } = parseQtyUnit(openBalRaw);
      const baseUnit = text(it.BASEUNITS) || unit || "pcs";
      const rate = parseRate(text(it.OPENINGRATE));

      const stock: TallyStockItem = {
        name,
        unit: baseUnit,
        opening_qty: qty,
        opening_rate: rate,
        group: parent,
      };

      const isRaw = parentMatches(parent, opts.rawGroups);
      const isFinished = parentMatches(parent, opts.finishedGroups);

      if (isRaw) rawMaterials.push(stock);
      else if (isFinished) finishedGoods.push(stock);
      else {
        // Fallback heuristic: words like raw/material/component → raw; else finished
        if (/raw|material|component|fabric|foam|spring|cloth|thread/i.test(parent)) rawMaterials.push(stock);
        else finishedGoods.push(stock);
      }
    }
  }

  return { customers, vendors, rawMaterials, finishedGoods };
}
