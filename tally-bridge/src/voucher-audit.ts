import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AuditRow = {
  voucherNumber: string; date: string; voucherType: string; guid: string;
  ledgerFamily: "ALLLEDGERENTRIES.LIST" | "LEDGERENTRIES.LIST" | "none";
  ledgerEntries: number; ledgerAmountCount: number; ledgerNet: number | null;
  inventoryEntries: number; inventoryAmountCount: number; inventoryNet: number | null;
  inventoryAccountingAllocations: number; allocationAmountCount: number; allocationNet: number | null;
  combinedCandidateNet: number | null;
  status: "candidate-balanced" | "candidate-unbalanced" | "incomplete" | "no-ledger-postings";
  notes: string[];
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blocks = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp("<" + esc(tag) + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + esc(tag) + ">", "gi"))].map(m => m[1]);
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp("<" + esc(name) + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + esc(name) + ">", "i"));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim() : "";
};
function amount(raw: string): number | null {
  if (!raw.trim()) return null;
  let s = raw.trim().replace(/,/g, "").replace(/[₹$£€\s]/g, "");
  const parens = /^\(.*\)$/.test(s);
  if (parens) s = s.slice(1, -1);
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (parens ? -n : n) : null;
}
function rounded(value: number): number {
  const n = Number(value.toFixed(4));
  // Normalize IEEE-754 negative zero so strict comparisons and JSON reports are stable.
  if (Object.is(n, -0) || Math.abs(n) < 0.00005) return 0;
  return n;
}
function sumEntryAmounts(entries: string[]) {
  // Read the entry's own AMOUNT only. Scanning all descendant AMOUNT tags
  // would double-count nested bill allocations or inventory accounting splits.
  const parsed = entries.map(entry => amount(tag(entry, "AMOUNT")));
  return { count: parsed.filter(v => v !== null).length, missing: parsed.filter(v => v === null).length,
    sum: parsed.reduce<number>((s, v) => s + (v ?? 0), 0) };
}

/**
 * Diagnostic, not an accounting sign-off. Chooses ALLLEDGERENTRIES when present,
 * otherwise LEDGERENTRIES; it never adds both alias families together. Candidate
 * net = selected ledger postings + accounting allocations nested under inventory
 * entries. Inventory line AMOUNT is reported separately and not added again.
 */
export function auditVoucherXml(xml: string): AuditRow[] {
  return blocks(xml, "VOUCHER").map(v => {
    const allLedger = blocks(v, "ALLLEDGERENTRIES.LIST");
    const regularLedger = blocks(v, "LEDGERENTRIES.LIST");
    const family = allLedger.length ? "ALLLEDGERENTRIES.LIST" as const :
      regularLedger.length ? "LEDGERENTRIES.LIST" as const : "none" as const;
    const ledgers = allLedger.length ? allLedger : regularLedger;
    const allInv = blocks(v, "ALLINVENTORYENTRIES.LIST");
    const regularInv = blocks(v, "INVENTORYENTRIES.LIST");
    const inventory = allInv.length ? allInv : regularInv;
    const allocations = inventory.flatMap(entry => blocks(entry, "ACCOUNTINGALLOCATIONS.LIST"));
    const ledgerTotals = sumEntryAmounts(ledgers);
    const inventoryTotals = sumEntryAmounts(inventory);
    const allocationTotals = sumEntryAmounts(allocations);
    const guid = tag(v, "GUID"), date = tag(v, "DATE"), number = tag(v, "VOUCHERNUMBER");
    const notes: string[] = [];
    if (!ledgers.length) notes.push("No ledger-entry blocks found.");
    if (ledgers.length && ledgerTotals.count !== ledgers.length) notes.push("Selected ledger entry has missing/unparseable AMOUNT.");
    if (inventory.length && !allocations.length) notes.push("Inventory exists without nested accounting allocations.");
    if (allocations.length && allocationTotals.count !== allocations.length) notes.push("Inventory accounting allocation has missing/unparseable AMOUNT.");
    if (!guid) notes.push("Missing GUID.");
    if (!/^\d{8}$/.test(date)) notes.push("Missing/invalid DATE.");
    if (!number) notes.push("Missing voucher number.");
    const complete = ledgers.length > 0 && ledgerTotals.count === ledgers.length &&
      (!allocations.length || allocationTotals.count === allocations.length);
    const net = complete ? ledgerTotals.sum + allocationTotals.sum : null;
    const status = !ledgers.length ? "no-ledger-postings" as const : !complete ? "incomplete" as const :
      Math.abs(net!) <= 0.005 ? "candidate-balanced" as const : "candidate-unbalanced" as const;
    return {
      voucherNumber: number, date, voucherType: tag(v, "VOUCHERTYPENAME"), guid,
      ledgerFamily: family, ledgerEntries: ledgers.length, ledgerAmountCount: ledgerTotals.count,
      ledgerNet: ledgerTotals.count ? rounded(ledgerTotals.sum) : null,
      inventoryEntries: inventory.length, inventoryAmountCount: inventoryTotals.count,
      inventoryNet: inventoryTotals.count ? rounded(inventoryTotals.sum) : null,
      inventoryAccountingAllocations: allocations.length, allocationAmountCount: allocationTotals.count,
      allocationNet: allocationTotals.count ? rounded(allocationTotals.sum) : null,
      combinedCandidateNet: net === null ? null : rounded(net), status, notes
    };
  });
}

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error("Usage: node --import tsx src/voucher-audit.ts <manifest.json>"); process.exitCode = 2; return; }
  const manifestPath = path.resolve(arg);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { company: string; segments: Array<{kind:string;path:string}> };
  const segments = manifest.segments.filter(s => s.kind === "data");
  if (!segments.length) throw new Error("Manifest contains no data segments.");
  const rows: AuditRow[] = [];
  for (const segment of segments) {
    const file = path.isAbsolute(segment.path) ? segment.path : path.resolve(segment.path);
    rows.push(...auditVoucherXml(await readFile(file, "utf8")));
  }
  const count = (s: AuditRow["status"]) => rows.filter(r => r.status === s).length;
  const report = {
    generatedAt: new Date().toISOString(), company: manifest.company, manifest: manifestPath,
    voucherCount: rows.length,
    summary: {
      candidateBalanced: count("candidate-balanced"), candidateUnbalanced: count("candidate-unbalanced"),
      incomplete: count("incomplete"), noLedgerPostings: count("no-ledger-postings"),
      vouchersWithInventory: rows.filter(r => r.inventoryEntries > 0).length,
      totalInventoryEntries: rows.reduce((n,r) => n+r.inventoryEntries,0),
      vouchersWithInventoryAccountingAllocations: rows.filter(r => r.inventoryAccountingAllocations > 0).length,
      missingGuid: rows.filter(r => !r.guid).length, missingDate: rows.filter(r => !/^\d{8}$/.test(r.date)).length,
      ledgerFamilies: rows.reduce((a,r) => { a[r.ledgerFamily]=(a[r.ledgerFamily]||0)+1; return a; }, {} as Record<string,number>)
    }, rows
  };
  const output = path.join(path.dirname(manifestPath), "voucher-audit.json");
  await writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log("Read-only voucher audit complete; source XML unchanged.");
  console.log("Company:", manifest.company, "| vouchers:", rows.length);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("Detailed report:", output);
  console.log("Candidate balance is diagnostic only; investigate every unbalanced/incomplete row before sign-off.");
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/voucher-audit.ts")) {
  main().catch(e => { console.error(e); process.exitCode = 1; });
}
