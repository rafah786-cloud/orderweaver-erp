import { XMLParser, XMLValidator } from "fast-xml-parser";

export type TallySourceIdentity = { source_guid?: string | null; master_id?: string | null };

export type TallyParty = TallySourceIdentity & {
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
  /** Tally Alter ID when supplied by the source export. */
  alter_id?: string | null;
  /** Closing balance from LEDGER export, if present. Falls back to opening when absent. */
  closing_balance: number;
};

export type TallyStockItem = TallySourceIdentity & {
  name: string;
  unit: string;
  opening_qty: number;
  opening_rate: number;
  group: string;
  alter_id?: string | null;
  lifecycle_state: "posted" | "cancelled" | "optional" | "deleted";
};

export type TallyLedgerEntry = {
  alter_id?: string | null;
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

/** A Tally account group (Chart of Accounts node). */
export type TallyGroup = TallySourceIdentity & {
  name: string;
  parent: string | null;
  nature: "assets" | "liabilities" | "income" | "expenses";
  affects_gross_profit: boolean;
  alter_id?: string | null;
  lifecycle_state: "posted" | "cancelled" | "optional" | "deleted";
};

/** Any Tally ledger master, regardless of group. */
export type TallyLedgerMaster = TallySourceIdentity & {
  name: string;
  parent: string;
  gstin: string | null;
  opening_balance: number;
  /** "dr" when the opening balance is a debit. */
  opening_type: "dr" | "cr";
  notes: string | null;
  alter_id?: string | null;
  lifecycle_state: "posted" | "cancelled" | "optional" | "deleted";
};

export type TallyGodown = TallySourceIdentity & {
  name: string;
  parent: string | null;
  address: string | null;
  alter_id?: string | null;
  lifecycle_state: "posted" | "cancelled" | "optional" | "deleted";
};
export type TallyCostCentre = TallySourceIdentity & {
  alter_id?: string | null;
  name: string;
  parent: string | null;
  lifecycle_state: "posted" | "cancelled" | "optional" | "deleted";
};

/** Bill-wise outstanding reference carried on a ledger master or voucher. */
export type TallyBill = {
  party_name: string;
  bill_name: string;
  bill_date: string | null;
  /** Positive = receivable (Dr), negative = payable (Cr). */
  amount: number;
  reference_type: "opening" | "new_ref" | "against_ref" | "on_account" | "advance" | "cleared";
  voucher_guid: string | null;
  external_ref: string;
  alter_id?: string | null;
  lifecycle_state: "posted" | "cancelled" | "optional" | "deleted";
};

/** Complete source voucher for pre-import reconciliation; never inferred from party balances. */
export type TallyVoucher = {
  source_id: string;
  has_stable_id: boolean;
  voucher_type: string | null;
  voucher_number: string | null;
  voucher_date: string;
  alter_id?: string | null;
  entries: Array<{ ledger_name: string; debit: number; credit: number }>;
  inventory_entries: Array<{
    stock_item_name: string;
    actual_qty: number;
    billed_qty: number;
    unit: string;
    rate: number;
    amount: number;
    is_deemed_positive: boolean;
    godown_name: string | null;
    batch_name: string | null;
  }>;
  lifecycle_state: "posted" | "cancelled" | "optional" | "deleted";
};

export type TallyParsed = {
  customers: TallyParty[];
  vendors: TallyParty[];
  rawMaterials: TallyStockItem[];
  finishedGoods: TallyStockItem[];
  /** Voucher-level ledger entries (Day Book / Ledger XML exports). */
  ledgerEntries: TallyLedgerEntry[];
  /** Full Chart of Accounts. */
  groups: TallyGroup[];
  ledgers: TallyLedgerMaster[];
  godowns: TallyGodown[];
  costCentres: TallyCostCentre[];
  bills: TallyBill[];
  vouchers: TallyVoucher[];
  units?: Array<TallySourceIdentity & { name: string; alter_id: string | null }>;
  sourceCompanies?: Array<{ name: string; guid: string }>;
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

const identityOf = (node: Record<string, unknown>): TallySourceIdentity => ({
  source_guid: text(node.GUID ?? node.REMOTEID ?? node["@_REMOTEID"]) || null,
  master_id: text(node.MASTERID) || null,
});

const alterIdOf = (node: Record<string, unknown>): string | null =>
  text(node.ALTERID ?? node["@_ALTERID"]) || null;

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
  opts: { rawGroups: string[]; finishedGroups: string[]; preserveLifecycle?: boolean },
): TallyParsed {
  if (!xml || !xml.trim()) {
    throw new TallyXmlError(
      "The uploaded file is empty.",
      "Re-export from Tally (Alt + E → XML) and try again.",
    );
  }
  // Strip UTF-8/UTF-16 BOM and leading whitespace before sniffing.
  const stripped = xml
    .replace(/^\uFEFF/, "")
    .replace(/^\uFFFE/, "")
    .trimStart();
  const head = stripped.slice(0, 500).toLowerCase();
  const looksLikeXml =
    head.startsWith("<?xml") || head.startsWith("<!doctype") || /^<[a-z_][\w:.-]*[\s>/]/.test(head);
  if (!looksLikeXml) {
    throw new TallyXmlError(
      "This file does not look like an XML document.",
      "Make sure you chose the .xml file exported by Tally, not a PDF, Excel, or backup file.",
    );
  }
  xml = stripped;
  if (new TextEncoder().encode(xml).length > 20 * 1024 * 1024)
    throw new TallyXmlError("XML exceeds the 20 MB limit. Export smaller date ranges.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new TallyXmlError("XML document types and entities are not accepted.");
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(xml))
    throw new TallyXmlError("XML contains invalid control characters. Re-export from Tally.");
  if (XMLValidator.validate(xml) !== true)
    throw new TallyXmlError("The XML file is malformed or incomplete. Re-export from Tally.");

  let json: Record<string, unknown>;
  try {
    json = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    throw new TallyXmlError(
      "The XML file is malformed and could not be parsed.",
      `Re-export from Tally without modifying the file. (${(e as Error).message})`,
    );
  }

  const envelope = (json as { ENVELOPE?: Record<string, unknown> })?.ENVELOPE;
  if (!envelope) {
    throw new TallyXmlError(
      "This XML is missing the required <ENVELOPE> root element used by Tally exports.",
      "In Tally: Display More Reports → List of Accounts (or Day Book) → Alt + E → Export as XML.",
    );
  }
  const body = (envelope as { BODY?: Record<string, unknown> }).BODY;
  if (!body) {
    throw new TallyXmlError(
      "This Tally XML is missing the <BODY> section.",
      "Re-export the report from Tally — the file may be incomplete or truncated.",
    );
  }

  const rawMessages =
    (body as { DATA?: { TALLYMESSAGE?: unknown } }).DATA?.TALLYMESSAGE ??
    (body as { IMPORTDATA?: { REQUESTDATA?: { TALLYMESSAGE?: unknown } } }).IMPORTDATA?.REQUESTDATA
      ?.TALLYMESSAGE;

  if (rawMessages == null) {
    throw new TallyXmlError(
      "No <TALLYMESSAGE> records found in this XML.",
      "Export Masters (List of Accounts) or a Day Book / Ledger report from Tally — other report formats are not supported.",
    );
  }

  const messages = arr<Record<string, unknown>>(
    rawMessages as Record<string, unknown> | Record<string, unknown>[],
  );
  if (messages.length === 0) {
    throw new TallyXmlError(
      "The XML contains no master or voucher records.",
      "Check the date range and filters in Tally before exporting, then try again.",
    );
  }

  const sourceCompanies: Array<{ name: string; guid: string }> = [];
  const units: NonNullable<TallyParsed["units"]> = [];
  const customers: TallyParty[] = [];
  const vendors: TallyParty[] = [];
  const rawMaterials: TallyStockItem[] = [];
  const finishedGoods: TallyStockItem[] = [];
  const ledgerEntries: TallyLedgerEntry[] = [];
  const groups: TallyGroup[] = [];
  const ledgersOut: TallyLedgerMaster[] = [];
  const godowns: TallyGodown[] = [];
  const costCentres: TallyCostCentre[] = [];
  const bills: TallyBill[] = [];
  const preserveLifecycle = opts.preserveLifecycle === true;
  const vouchersOut: TallyVoucher[] = [];

  // Build a map of ledger-name → party type to classify vouchers
  const partyType = new Map<string, "customer" | "vendor">();
  // group name (lowercased) → nature, used to classify ledgers under it
  const groupNature = new Map<string, TallyGroup["nature"]>();

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

  const lifecycleState = (
    node: Record<string, unknown>,
  ): "posted" | "cancelled" | "optional" | "deleted" =>
    isYes(node.ISDELETED)
      ? "deleted"
      : isYes(node.ISCANCELLED) || isYes(node.CANCELLED)
        ? "cancelled"
        : isYes(node.ISOPTIONAL)
          ? "optional"
          : "posted";

  /** Infer the accounting nature of a Tally group from its own / parent name. */
  const natureOf = (name: string, parent: string): TallyGroup["nature"] => {
    const known = groupNature.get(parent.toLowerCase());
    if (known) return known;
    const s = `${parent} ${name}`.toLowerCase();
    if (/(sales|income|revenue|direct incomes|indirect incomes)/.test(s)) return "income";
    if (/(purchase|expense|expenses|direct expenses|indirect expenses|cost)/.test(s))
      return "expenses";
    if (/(liabilit|capital|loan|creditor|payable|provision|duties|reserve|suspense)/.test(s))
      return "liabilities";
    return "assets";
  };

  /** Bill-wise allocations on a ledger master (opening outstanding) or voucher line. */
  const collectBills = (
    partyName: string,
    node: Record<string, unknown>,
    voucherGuid: string | null = null,
  ) => {
    const lists: Array<{
      values: Record<string, unknown>[];
      fallback: TallyBill["reference_type"];
    }> = [
      {
        values: arr<Record<string, unknown>>(node["OPENINGBILLALLOCATIONS.LIST"] as never),
        fallback: "opening",
      },
      {
        values: arr<Record<string, unknown>>(node["BILLALLOCATIONS.LIST"] as never),
        fallback: "new_ref",
      },
      {
        values: arr<Record<string, unknown>>(node["BILLSCLEARED.LIST"] as never),
        fallback: "cleared",
      },
    ];
    for (const { values, fallback } of lists)
      for (const b of values) {
        if (!preserveLifecycle && lifecycleState(b) !== "posted") continue;
        const bill_name = text(b.NAME ?? b.BILLNAME);
        if (!bill_name) continue;
        const method = text(b.BILLTYPE ?? b.METHOD)
          .toLowerCase()
          .replace(/[\s-]+/g, "_");
        const reference_type: TallyBill["reference_type"] =
          method === "against_ref" || method === "agst_ref"
            ? "against_ref"
            : method === "on_account"
              ? "on_account"
              : method === "advance"
                ? "advance"
                : method === "new_ref"
                  ? "new_ref"
                  : fallback;
        const bill_date = parseTallyDate(text(b.BILLDATE ?? b.DATE)) || null;
        bills.push({
          party_name: partyName,
          bill_name,
          bill_date,
          amount: num(b.AMOUNT ?? b.OPENINGBALANCE),
          alter_id: alterIdOf(b),
          reference_type,
          voucher_guid: voucherGuid,
          external_ref: [
            voucherGuid ?? "master",
            partyName,
            bill_name,
            bill_date ?? "",
            reference_type,
          ].join("|"),
          lifecycle_state: lifecycleState(b),
        });
      }
  };

  for (const msg of messages) {
    for (const c of arr<Record<string, unknown>>(msg.COMPANY as never)) {
      sourceCompanies.push({ name: text(c["@_NAME"] ?? c.NAME), guid: text(c.GUID) });
    }
    for (const u of arr<Record<string, unknown>>(msg.UNIT as never)) {
      units.push({ ...identityOf(u), name: text(u["@_NAME"] ?? u.NAME), alter_id: alterIdOf(u) });
    }
    /* ---------------- GROUP masters (Chart of Accounts) ---------------- */
    for (const g of arr<Record<string, unknown>>(msg.GROUP as never)) {
      if (!preserveLifecycle && lifecycleState(g) !== "posted") continue;
      const name = text(g["@_NAME"] ?? g.NAME);
      if (!name) continue;
      const parent = text(g.PARENT);
      const nature = natureOf(name, parent);
      groupNature.set(name.toLowerCase(), nature);
      groups.push({
        ...identityOf(g),
        name,
        parent: parent || null,
        nature,
        alter_id: alterIdOf(g),
        affects_gross_profit: isYes(g.AFFECTSGROSSPROFIT),
        lifecycle_state: lifecycleState(g),
      });
    }

    /* ---------------- GODOWN masters ---------------- */
    for (const g of arr<Record<string, unknown>>(msg.GODOWN as never)) {
      if (!preserveLifecycle && lifecycleState(g) !== "posted") continue;
      const name = text(g["@_NAME"] ?? g.NAME);
      if (!name) continue;
      godowns.push({
        ...identityOf(g),
        name,
        parent: text(g.PARENT) || null,
        address: flattenAddress(g["ADDRESS.LIST"]) || null,
        alter_id: alterIdOf(g),
        lifecycle_state: lifecycleState(g),
      });
    }

    /* ---------------- COSTCENTRE masters ---------------- */
    for (const c of arr<Record<string, unknown>>(msg.COSTCENTRE as never)) {
      if (!preserveLifecycle && lifecycleState(c) !== "posted") continue;
      const name = text(c["@_NAME"] ?? c.NAME);
      if (!name) continue;
      costCentres.push({
        ...identityOf(c),
        name,
        parent: text(c.PARENT) || null,
        alter_id: alterIdOf(c),
        lifecycle_state: lifecycleState(c),
      });
    }

    /* ---------------- LEDGER masters ---------------- */
    const ledgers = arr<Record<string, unknown>>(
      msg.LEDGER as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    for (const l of ledgers) {
      if (!preserveLifecycle && lifecycleState(l) !== "posted") continue;
      const name = text(l["@_NAME"] ?? l.NAME) || text(l.MAILINGNAME);
      if (!name) continue;
      const parentRaw = text(l.PARENT);
      const parent = parentRaw.toLowerCase();

      const opening = num(l.OPENINGBALANCE);
      const closingRaw = l.CLOSINGBALANCE;
      const closing = closingRaw != null ? num(closingRaw) : opening;

      // Every ledger — of any group — becomes a chart-of-accounts entry.
      ledgersOut.push({
        ...identityOf(l),
        name,
        parent: parentRaw || "Primary",
        gstin: extractGstin(l),
        alter_id: alterIdOf(l),
        opening_balance: Math.abs(opening),
        opening_type: opening >= 0 ? "dr" : "cr",
        notes: parentRaw ? `Tally group: ${parentRaw}` : null,
        lifecycle_state: lifecycleState(l),
      });

      const isCustomer = parent.includes("sundry debtor") || parent.includes("debtor");
      const isVendor = parent.includes("sundry creditor") || parent.includes("creditor");
      if (!isCustomer && !isVendor) continue;

      collectBills(name, l);

      const party: TallyParty = {
        ...identityOf(l),
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
        alter_id: alterIdOf(l),
        closing_balance: closing,
      };
      (isCustomer ? customers : vendors).push(party);
      partyType.set(name.toLowerCase(), isCustomer ? "customer" : "vendor");
    }

    /* ---------------- STOCKITEM masters ---------------- */
    const items = arr<Record<string, unknown>>(
      msg.STOCKITEM as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    for (const it of items) {
      if (!preserveLifecycle && lifecycleState(it) !== "posted") continue;
      const name = text(it["@_NAME"] ?? it.NAME);
      if (!name) continue;
      const parent = text(it.PARENT);
      const openBalRaw = text(it.OPENINGBALANCE);
      const { qty, unit } = parseQtyUnit(openBalRaw);
      const baseUnit = text(it.BASEUNITS) || unit || "pcs";
      const rate = parseRate(text(it.OPENINGRATE));

      const stock: TallyStockItem = {
        ...identityOf(it),
        name,
        unit: baseUnit,
        opening_qty: qty,
        alter_id: alterIdOf(it),
        opening_rate: rate,
        group: parent,
        lifecycle_state: lifecycleState(it),
      };

      const isRaw = parentMatches(parent, opts.rawGroups);
      const isFinished = parentMatches(parent, opts.finishedGroups);

      if (isRaw) rawMaterials.push(stock);
      else if (isFinished) finishedGoods.push(stock);
      else {
        if (/raw|material|component|fabric|foam|spring|cloth|thread/i.test(parent))
          rawMaterials.push(stock);
        else finishedGoods.push(stock);
      }
    }

    /* ---------------- VOUCHER entries (Day Book / Ledger export) ---------------- */
    const vouchers = arr<Record<string, unknown>>(
      msg.VOUCHER as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    for (const v of vouchers) {
      if (!preserveLifecycle && lifecycleState(v) !== "posted") continue;
      const dateRaw = text(v.DATE ?? v["@_DATE"]);
      const entry_date = parseTallyDate(dateRaw);
      if (!entry_date && !preserveLifecycle) continue;
      const voucher_type = text(v.VOUCHERTYPENAME ?? v["@_VCHTYPE"]) || null;
      const voucher_number = text(v.VOUCHERNUMBER) || null;
      const narration = text(v.NARRATION) || null;
      const guid =
        text(v.GUID ?? v.REMOTEID ?? v["@_REMOTEID"]) ||
        `${voucher_type ?? ""}|${voucher_number ?? ""}|${entry_date}`;
      // Prime uses PARTYLEDGERNAME for the bill-to party on Sales/Purchase;
      // some voucher lines only carry the offsetting account (e.g. Sales A/c).
      const partyLedgerName = text(v.PARTYLEDGERNAME ?? v.PARTYNAME) || null;

      const ledgerLines = arr<Record<string, unknown>>(
        v["ALLLEDGERENTRIES.LIST"] as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | undefined,
      );
      const altLines = arr<Record<string, unknown>>(
        v["LEDGERENTRIES.LIST"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
      );
      const lines = [...ledgerLines, ...altLines];
      const accountingLines = [...lines];

      const inventoryEntries: TallyVoucher["inventory_entries"] = [];
      const rawInventoryEntries = [
        ...arr<Record<string, unknown>>(v["ALLINVENTORYENTRIES.LIST"] as never),
        ...arr<Record<string, unknown>>(v["INVENTORYENTRIES.LIST"] as never),
      ];
      for (const inv of rawInventoryEntries) {
        accountingLines.push(...arr<Record<string, unknown>>(inv["ACCOUNTINGALLOCATIONS.LIST"] as never));
        const actual = parseQtyUnit(text(inv.ACTUALQTY));
        const billed = parseQtyUnit(text(inv.BILLEDQTY));
        const batches = arr<Record<string, unknown>>(
          inv["BATCHALLOCATIONS.LIST"] as
            | Record<string, unknown>
            | Record<string, unknown>[]
            | undefined,
        );
        if (batches.length === 0) {
          inventoryEntries.push({
            stock_item_name: text(inv.STOCKITEMNAME),
            actual_qty: actual.qty,
            billed_qty: billed.qty,
            unit: actual.unit || billed.unit,
            rate: parseRate(text(inv.RATE)),
            amount: num(inv.AMOUNT),
            is_deemed_positive: isYes(inv.ISDEEMEDPOSITIVE),
            godown_name: null,
            batch_name: null,
          });
        } else {
          for (const batch of batches) {
            const batchActual = parseQtyUnit(text(batch.ACTUALQTY));
            const batchBilled = parseQtyUnit(text(batch.BILLEDQTY));
            inventoryEntries.push({
              stock_item_name: text(inv.STOCKITEMNAME),
              actual_qty: batchActual.qty || actual.qty,
              billed_qty: batchBilled.qty || billed.qty,
              unit: batchActual.unit || batchBilled.unit || actual.unit || billed.unit,
              rate: parseRate(text(batch.RATE ?? inv.RATE)),
              amount: num(batch.AMOUNT ?? inv.AMOUNT),
              is_deemed_positive: isYes(inv.ISDEEMEDPOSITIVE),
              godown_name: text(batch.GODOWNNAME ?? batch.DESTINATIONGODOWNNAME) || null,
              batch_name: text(batch.BATCHNAME) || null,
            });
          }
        }
      }

      vouchersOut.push({
        source_id: guid,
        alter_id: alterIdOf(v),
        has_stable_id: !!text(v.GUID ?? v.REMOTEID ?? v["@_REMOTEID"]),
        voucher_type,
        voucher_number,
        voucher_date: entry_date,
        entries: accountingLines.map((line) => {
          const amount = num(line.AMOUNT);
          const debit = isYes(line.ISDEEMEDPOSITIVE) ? Math.abs(amount) : 0;
          return {
            ledger_name: text(line.LEDGERNAME),
            debit,
            credit: debit ? 0 : Math.abs(amount),
          };
        }),
        inventory_entries: inventoryEntries,
        lifecycle_state: lifecycleState(v),
      });

      for (const line of accountingLines) {
        const ledgerName = text(line.LEDGERNAME);
        collectBills(ledgerName, line, guid);
      }

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
          alter_id: alterIdOf(v),
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
              alter_id: alterIdOf(v),
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
    ledgerEntries.length === 0 &&
    vouchersOut.length === 0 &&
    units.length === 0 &&
    groups.length === 0 &&
    ledgersOut.length === 0 &&
    godowns.length === 0 &&
    costCentres.length === 0
  ) {
    throw new TallyXmlError(
      "The XML was valid but contained no masters or voucher entries.",
      "Make sure you exported the right report from Tally: Masters (List of Accounts) for parties, ledgers and stock, or Day Book / Ledger for transactions.",
    );
  }

  return {
    customers,
    vendors,
    rawMaterials,
    finishedGoods,
    ledgerEntries,
    groups,
    ledgers: ledgersOut,
    godowns,
    costCentres,
    bills,
    vouchers: vouchersOut,
    units,
    sourceCompanies,
  };
}
