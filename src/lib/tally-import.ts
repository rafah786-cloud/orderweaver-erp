import { XMLParser } from "fast-xml-parser";

export type TallyParty = {
  name: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  state_code?: string | null;
  pin_code?: string | null;
  contact_person?: string | null;
  pan?: string | null;
  /** Positive = Dr (receivable / asset), negative = Cr (payable / liability) */
  opening_balance: number;
  /** Closing balance from LEDGER export, if present. Falls back to opening when absent. */
  closing_balance: number;
};

export type TallyStockItem = {
  name: string;
  unit: string;
  opening_qty: number;
  opening_rate: number;
  group: string;
};

export type TallyLedgerEntry = {
  /** Tally ledger name this entry belongs to (party/vendor). */
  party_name: string;
  entry_date: string; // ISO yyyy-mm-dd
  voucher_type: string | null;
  voucher_number: string | null;
  debit: number;
  credit: number;
  narration: string | null;
  /** Stable per-voucher key for idempotent re-imports. */
  external_ref: string;
};

export type TallyParsed = {
  customers: TallyParty[];
  vendors: TallyParty[];
  rawMaterials: TallyStockItem[];
  finishedGoods: TallyStockItem[];
  /** Voucher-level ledger entries (Day Book / Ledger XML exports). */
  ledgerEntries: TallyLedgerEntry[];
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
    const t = (v as Record<string, unknown>)["#text"];
    if (typeof t === "string") return t.trim();
  }
  return "";
}

function num(v: unknown): number {
  const s = text(v).replace(/,/g, "").trim();
  if (!s) return 0;
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
  const s = raw.split("/")[0]?.trim() ?? "";
  return num(s);
}

function flattenAddress(v: unknown): string {
  if (!v) return "";
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

/** Tally dates are YYYYMMDD (e.g. 20240415). Returns ISO yyyy-mm-dd or "". */
function parseTallyDate(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // Some exports use yyyy-mm-dd already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

export class TallyXmlError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = "TallyXmlError";
    this.hint = hint;
  }
}

export function parseTallyMasters(
  xml: string,
  opts: { rawGroups: string[]; finishedGroups: string[] }
): TallyParsed {
  if (!xml || !xml.trim()) {
    throw new TallyXmlError(
      "The uploaded file is empty.",
      "Re-export from Tally (Alt + E → XML) and try again."
    );
  }
  const head = xml.trimStart().slice(0, 200).toLowerCase();
  if (!head.startsWith("<?xml") && !head.startsWith("<envelope")) {
    throw new TallyXmlError(
      "This file does not look like an XML document.",
      "Make sure you chose the .xml file exported by Tally, not a PDF, Excel, or backup file."
    );
  }

  let json: Record<string, unknown>;
  try {
    json = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    throw new TallyXmlError(
      "The XML file is malformed and could not be parsed.",
      `Re-export from Tally without modifying the file. (${(e as Error).message})`
    );
  }

  const envelope = (json as { ENVELOPE?: Record<string, unknown> })?.ENVELOPE;
  if (!envelope) {
    throw new TallyXmlError(
      "This XML is missing the required <ENVELOPE> root element used by Tally exports.",
      "In Tally: Display More Reports → List of Accounts (or Day Book) → Alt + E → Export as XML."
    );
  }
  const body = (envelope as { BODY?: Record<string, unknown> }).BODY;
  if (!body) {
    throw new TallyXmlError(
      "This Tally XML is missing the <BODY> section.",
      "Re-export the report from Tally — the file may be incomplete or truncated."
    );
  }

  const rawMessages =
    ((body as { DATA?: { TALLYMESSAGE?: unknown } }).DATA?.TALLYMESSAGE) ??
    ((body as { IMPORTDATA?: { REQUESTDATA?: { TALLYMESSAGE?: unknown } } }).IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE);

  if (rawMessages == null) {
    throw new TallyXmlError(
      "No <TALLYMESSAGE> records found in this XML.",
      "Export Masters (List of Accounts) or a Day Book / Ledger report from Tally — other report formats are not supported."
    );
  }

  const messages = arr<Record<string, unknown>>(
    rawMessages as Record<string, unknown> | Record<string, unknown>[]
  );
  if (messages.length === 0) {
    throw new TallyXmlError(
      "The XML contains no master or voucher records.",
      "Check the date range and filters in Tally before exporting, then try again."
    );
  }


  const customers: TallyParty[] = [];
  const vendors: TallyParty[] = [];
  const rawMaterials: TallyStockItem[] = [];
  const finishedGoods: TallyStockItem[] = [];
  const ledgerEntries: TallyLedgerEntry[] = [];

  // Build a map of ledger-name → party type to classify vouchers
  const partyType = new Map<string, "customer" | "vendor">();

  // Extract a GSTIN from either the flat tag or the nested Prime-4+ GSTREGDETAILS.LIST
  const extractGstin = (l: Record<string, unknown>): string | null => {
    const flat = text(l.PARTYGSTIN ?? l.GSTREGISTRATIONNUMBER);
    if (flat) return flat;
    const details = arr<Record<string, unknown>>(
      l["GSTREGDETAILS.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    for (const d of details) {
      const v = text(d.GSTIN ?? d.GSTREGISTRATIONNUMBER ?? d.PARTYGSTIN);
      if (v) return v;
    }
    return null;
  };

  const isYes = (v: unknown) => text(v).toLowerCase() === "yes";

  for (const msg of messages) {
    /* ---------------- LEDGER masters ---------------- */
    const ledgers = arr<Record<string, unknown>>(
      msg.LEDGER as Record<string, unknown> | Record<string, unknown>[] | undefined
    );
    for (const l of ledgers) {
      // TallyPrime marks deleted masters with ISDELETED=Yes — skip them
      if (isYes(l.ISDELETED)) continue;
      const name = text(l["@_NAME"] ?? l.NAME) || text(l.MAILINGNAME);
      if (!name) continue;
      const parent = text(l.PARENT).toLowerCase();

      const isCustomer = parent.includes("sundry debtor") || parent.includes("debtor");
      const isVendor = parent.includes("sundry creditor") || parent.includes("creditor");
      if (!isCustomer && !isVendor) continue;

      const opening = num(l.OPENINGBALANCE);
      const closingRaw = l.CLOSINGBALANCE;
      const closing = closingRaw != null ? num(closingRaw) : opening;

      const party: TallyParty = {
        name,
        gstin: extractGstin(l),
        phone: text(l.LEDGERPHONE ?? l.LEDGERMOBILE ?? l.LEDGERCONTACT) || null,
        email: text(l.EMAIL ?? l.EMAILID) || null,
        address: flattenAddress(l["ADDRESS.LIST"]) || null,
        state_code: text(l.LEDSTATENAME ?? l.STATENAME) || null,
        pin_code: text(l.PINCODE ?? l.PINCODENUMBER) || null,
        contact_person: text(l.LEDGERCONTACT ?? l.CONTACTPERSON) || null,
        pan: text(l.INCOMETAXNUMBER ?? l.PANNUMBER) || null,
        opening_balance: opening,
        closing_balance: closing,
      };
      (isCustomer ? customers : vendors).push(party);
      partyType.set(name.toLowerCase(), isCustomer ? "customer" : "vendor");
    }

    /* ---------------- STOCKITEM masters ---------------- */
    const items = arr<Record<string, unknown>>(
      msg.STOCKITEM as Record<string, unknown> | Record<string, unknown>[] | undefined
    );
    for (const it of items) {
      if (isYes(it.ISDELETED)) continue;
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
        if (/raw|material|component|fabric|foam|spring|cloth|thread/i.test(parent)) rawMaterials.push(stock);
        else finishedGoods.push(stock);
      }
    }

    /* ---------------- VOUCHER entries (Day Book / Ledger export) ---------------- */
    const vouchers = arr<Record<string, unknown>>(
      msg.VOUCHER as Record<string, unknown> | Record<string, unknown>[] | undefined
    );
    for (const v of vouchers) {
      // Skip cancelled, optional, deleted vouchers in TallyPrime exports
      if (isYes(v.ISCANCELLED) || isYes(v.CANCELLED) || isYes(v.ISOPTIONAL) || isYes(v.ISDELETED)) {
        continue;
      }
      const dateRaw = text(v.DATE ?? v["@_DATE"]);
      const entry_date = parseTallyDate(dateRaw);
      if (!entry_date) continue;
      const voucher_type = text(v.VOUCHERTYPENAME ?? v["@_VCHTYPE"]) || null;
      const voucher_number = text(v.VOUCHERNUMBER) || null;
      const narration = text(v.NARRATION) || null;
      const guid = text(v.GUID ?? v["@_REMOTEID"]) || `${voucher_type ?? ""}|${voucher_number ?? ""}|${entry_date}`;
      // Prime uses PARTYLEDGERNAME for the bill-to party on Sales/Purchase;
      // some voucher lines only carry the offsetting account (e.g. Sales A/c).
      const partyLedgerName = text(v.PARTYLEDGERNAME ?? v.PARTYNAME) || null;

      const ledgerLines = arr<Record<string, unknown>>(
        v["ALLLEDGERENTRIES.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined
      );
      const altLines = arr<Record<string, unknown>>(
        v["LEDGERENTRIES.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined
      );
      const lines = [...ledgerLines, ...altLines];

      // First pass: emit entries for lines that directly reference a known party.
      let matchedParty = false;
      for (const line of lines) {
        const ledgerName = text(line.LEDGERNAME);
        if (!ledgerName) continue;
        const type = partyType.get(ledgerName.toLowerCase());
        if (!type) continue;

        const amount = num(line.AMOUNT);
        const isDeemedPositive = isYes(line.ISDEEMEDPOSITIVE);
        // ISDEEMEDPOSITIVE=Yes means the ledger is being debited on this line.
        const debit = isDeemedPositive ? Math.abs(amount) : 0;
        const credit = !isDeemedPositive ? Math.abs(amount) : 0;

        ledgerEntries.push({
          party_name: ledgerName,
          entry_date,
          voucher_type,
          voucher_number,
          debit,
          credit,
          narration,
          external_ref: `${guid}|${ledgerName}`,
        });
        matchedParty = true;
      }

      // Fallback: PARTYLEDGERNAME (Prime POS/quick vouchers) — only if no direct party line was found.
      if (!matchedParty && partyLedgerName) {
        const t = partyType.get(partyLedgerName.toLowerCase());
        if (t) {
          // Net the voucher: sum of non-party lines drives the party movement.
          let net = 0;
          for (const line of lines) {
            const ln = text(line.LEDGERNAME);
            if (!ln || ln.toLowerCase() === partyLedgerName.toLowerCase()) continue;
            const amount = num(line.AMOUNT);
            const isDeemedPositive = isYes(line.ISDEEMEDPOSITIVE);
            // Opposite side from the party line
            net += isDeemedPositive ? -Math.abs(amount) : Math.abs(amount);
          }
          const debit = net > 0 ? net : 0;
          const credit = net < 0 ? -net : 0;
          if (debit || credit) {
            ledgerEntries.push({
              party_name: partyLedgerName,
              entry_date,
              voucher_type,
              voucher_number,
              debit,
              credit,
              narration,
              external_ref: `${guid}|${partyLedgerName}`,
            });
          }
        }
      }
    }
  }

  if (
    customers.length === 0 &&
    vendors.length === 0 &&
    rawMaterials.length === 0 &&
    finishedGoods.length === 0 &&
    ledgerEntries.length === 0
  ) {
    throw new TallyXmlError(
      "The XML was valid but contained no customers, vendors, stock items, or voucher entries.",
      "Make sure you exported the right report from Tally: Masters (List of Accounts) for parties and stock, or Day Book / Ledger for transactions."
    );
  }

  return { customers, vendors, rawMaterials, finishedGoods, ledgerEntries };
}
