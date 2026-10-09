import { parseTallyMasters, type TallyParsed } from "./tally-import";
import { inspectTallyAccounting } from "./tally-integrity";

export const LOCAL_TALLY_URL = "http://127.0.0.1:9010";
export const MAX_TALLY_FILE_BYTES = 20 * 1024 * 1024;

export function validAccountingDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function previewLocalTally(xml: string) {
  const parsed = parseTallyMasters(xml, { rawGroups: [], finishedGroups: [], preserveLifecycle: true });
  const integrity = inspectTallyAccounting(parsed);
  const errors = [...integrity.errors];
  const warnings: string[] = [];
  const masters = [
    ["group", parsed.groups], ["ledger", parsed.ledgers],
    ["stock", [...parsed.rawMaterials, ...parsed.finishedGoods]],
    ["godown", parsed.godowns], ["cost centre", parsed.costCentres], ["unit", parsed.units ?? []],
  ] as const;
  for (const [kind, rows] of masters) {
    for (const field of ["source_guid", "master_id", "alter_id"] as const) {
      const seen = new Set<string>();
      for (const row of rows) {
        const value = row[field];
        if (value && seen.has(value)) errors.push(`Duplicate ${kind} ${field}: ${value}`);
        if (value) seen.add(value);
      }
    }
    const missing = rows.filter((row) => !row.source_guid).length;
    if (missing) errors.push(`${missing} ${kind} master(s) lack source GUID/REMOTEID; name-only mapping is unsafe.`);
  }
  const alterIds = new Set<string>();
  const byType: Record<string, { count: number; debit: number; credit: number }> = {};
  let stockQuantity = 0;
  let stockValue = 0;
  for (const v of parsed.vouchers) {
    if (!validAccountingDate(v.voucher_date)) errors.push(`${v.source_id}: invalid or missing voucher date`);
    if (!v.voucher_type) errors.push(`${v.source_id}: voucher type missing`);
    if (!v.voucher_number) warnings.push(`${v.source_id}: voucher number missing`);
    if (v.alter_id) {
      if (!/^\d+$/.test(v.alter_id)) errors.push(`${v.source_id}: invalid ALTERID`);
      const normalized = /^\d+$/.test(v.alter_id) ? BigInt(v.alter_id).toString() : v.alter_id;
      if (alterIds.has(normalized)) errors.push(`Duplicate voucher ALTERID: ${normalized}`);
      alterIds.add(normalized);
    } else warnings.push(`${v.source_id}: ALTERID missing; change tracking is unavailable`);
    const bucket = byType[v.voucher_type ?? "Unknown"] ??= { count: 0, debit: 0, credit: 0 };
    bucket.count++;
    if (v.lifecycle_state === "posted") {
      bucket.debit += v.entries.reduce((n, e) => n + e.debit, 0);
      bucket.credit += v.entries.reduce((n, e) => n + e.credit, 0);
    }
    for (const line of v.inventory_entries) {
      if (!line.stock_item_name || !line.unit) errors.push(`${v.source_id}: inventory item or unit missing`);
      if (![line.actual_qty, line.billed_qty, line.rate, line.amount].every(Number.isFinite)) errors.push(`${v.source_id}: invalid inventory numbers`);
      if (v.lifecycle_state === "posted") { stockQuantity += line.actual_qty; stockValue += line.amount; }
    }
  }
  for (const bill of parsed.bills) {
    if (!bill.party_name || !bill.bill_name) errors.push("Bill ledger or reference missing");
    if (bill.bill_date && !validAccountingDate(bill.bill_date)) errors.push(`${bill.bill_name}: invalid bill date`);
    if (bill.voucher_guid && !parsed.vouchers.some((v) => v.source_id === bill.voucher_guid)) errors.push(`${bill.bill_name}: source voucher not found`);
  }
  const identities = parsed.sourceCompanies ?? [];
  if (identities.length !== 1 || !identities[0]?.guid) warnings.push("XML does not identify exactly one source company GUID. Verify the source before staging.");
  const dates = parsed.vouchers.map((v) => v.voucher_date).filter(validAccountingDate).sort();
  return { parsed, errors, warnings, byType, stockQuantity, stockValue,
    dateFrom: dates[0] ?? null, dateTo: dates.at(-1) ?? null,
    cancelled: parsed.vouchers.filter((v) => v.lifecycle_state === "cancelled").length,
    inactive: parsed.vouchers.filter((v) => v.lifecycle_state !== "posted").length,
    billAmount: parsed.bills.reduce((n, b) => n + b.amount, 0),
    masterCount: masters.reduce((n, [, rows]) => n + rows.length, 0),
  };
}

export async function readLocalTallyFile(file: File): Promise<string> {
  if (!file.name.toLowerCase().endsWith(".xml")) throw new Error("Choose a Tally-exported .xml file, not native company data.");
  if (!file.size || file.size > MAX_TALLY_FILE_BYTES) throw new Error("Choose a non-empty XML file no larger than 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

export type LocalTallyPreview = ReturnType<typeof previewLocalTally>;
export type LocalTallyCompany = { name: string; guid: string };