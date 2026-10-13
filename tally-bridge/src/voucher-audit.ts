import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type VoucherAuditRow = {
  voucherNumber: string;
  date: string;
  voucherType: string;
  guid: string;
  ledgerEntryFamily: "ALLLEDGERENTRIES.LIST" | "LEDGERENTRIES.LIST" | "none";
  ledgerEntryCount: number;
  ledgerAmountCount: number;
  ledgerNet: number | null;
  inventoryEntryCount: number;
  inventoryAmountCount: number;
  inventoryNet: number | null;
  inventoryAccountingAllocationCount: number;
  inventoryAccountingAllocationAmountCount: number;
  inventoryAccountingAllocationNet: number | null;
  combinedCandidateNet: number | null;
  status: "candidate-balanced" | "candidate-unbalanced" | "incomplete" | "no-ledger-postings";
  notes: string[];
};

export type VoucherAuditReport = {
  generatedAt: string;
  sourceFile: string;
  voucherCount: number;
  rows: VoucherAuditRow[];
  summary: {
    candidateBalanced: number;
    candidateUnbalanced: number;
    incomplete: number;
    noLedgerPostings: number;
    vouchersWithInventory: number;
    totalInventoryEntries: number;
    vouchersWithInventoryAccountingAllocations: number;
    vouchersMissingGuid: number;
    vouchersMissingDate: number;
    vouchersMissingVoucherNumber: number;
    ledgerFamilies: Record<string, number>;
  };
};

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function firstTag(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp("<" + escaped + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + escaped + ">", "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function blocks(xml: string, tag: string): string[] {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...xml.matchAll(new RegExp("<" + escaped + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + escaped + ">", "gi"))].map(m => m[1]);
}

function parseAmount(raw: string): number | null {
  if (!raw.trim()) return null;
  let value = decodeXml(raw).trim().replace(/,/g, "").replace(/[₹$£€\s]/g, "");
  const parenthesized = /^\(.*\)$/.test(value);
  if (parenthesized) value = value.slice(1, -1);
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return parenthesized ? -n : n;
}

function amountValues(xml: string): { count: number; sum: number; missing: number } {
  const values = blocks(xml, "AMOUNT");
  let sum = 0;
  let count = 0;
  let missing = 0;
  for (const value of values) {
    const parsed = parseAmount(value);
    if (parsed === null) missing++;
    else { count++; sum += parsed; }
  }
  return { count, sum, missing };
}

/**
 * Diagnostic only: it never mutates source XML. The candidate balance combines
 * the selected ledger-entry family with accounting allocations nested in
 * inventory entries. Inventory line AMOUNT is deliberately not added separately,
 * because that can duplicate the corresponding accounting allocation.
 */
export function auditVoucherXml(xml: string, sourceFile = "(in-memory XML)"): VoucherAuditReport {
  const voucherXml = blocks(xml, "VOUCHER");
  const rows: VoucherAuditRow[] = [];
  const ledgerFamilies: Record<string, number> = {};

  for (const voucher of voucherXml) {
    const allLedger = blocks(voucher, "ALLLEDGERENTRIES.LIST");
    const regularLedger = blocks(voucher, "LEDGERENTRIES.LIST");
    const ledgerFamily = allLedger.length
      ? "ALLLEDGERENTRIES.LIST" as const
      : regularLedger.length
        ? "LEDGERENTRIES.LIST" as const
        : "none" as const;
    const ledgerBlocks = allLedger.length ? allLedger : regularLedger;
    ledgerFamilies[ledgerFamily] = (ledgerFamilies[ledgerFamily] || 0) + 1;

    const inventoryAll = blocks(voucher, "ALLINVENTORYENTRIES.LIST");
    const inventoryRegular = blocks(voucher, "INVENTORYENTRIES.LIST");
    const inventoryBlocks = inventoryAll.length ? inventoryAll : inventoryRegular;
    const ledgerXml = ledgerBlocks.join("\n");
    const inventoryXml = inventoryBlocks.join("\n");
    const inventoryAllocations = inventoryBlocks.flatMap(entry => blocks(entry, "ACCOUNTINGALLOCATIONS.LIST"));
    const ledgerAmounts = amountValues(ledgerXml);
    const inventoryAmounts = amountValues(inventoryXml);
    const allocationAmounts = amountValues(inventoryAllocations.join("\n"));
    const notes: string[] = [];

    if (!ledgerBlocks.length) notes.push("No ledger-entry blocks found.");
    if (ledgerAmounts.count !== ledgerBlocks.length) notes.push("One or more selected ledger entries lack a parseable AMOUNT.");
    if (inventoryBlocks.length && !inventoryAllocations.length) notes.push("Inventory entries exist but no nested accounting allocations were found.");
    if (inventoryAllocations.length && allocationAmounts.count !== inventoryAllocations.length) notes.push("One or more inventory accounting allocations lack a parseable AMOUNT.");
    if (!firstTag(voucher, "GUID")) notes.push("Missing GUID.");
    if (!/^\d{8}$/.test(firstTag(voucher, "DATE"))) notes.push("Missing or invalid DATE.");
    if (!firstTag(voucher, "VOUCHERNUMBER")) notes.push("Missing voucher number.");

    const hasAmounts = ledgerBlocks.length > 0 &&
      ledgerAmounts.count === ledgerBlocks.length &&
      (!inventoryAllocations.length || allocationAmounts.count === inventoryAllocations.length);
    const candidateNet = hasAmounts
      ? ledgerAmounts.sum + allocationAmounts.sum
      : null;
    const status: VoucherAuditRow["status"] = !ledgerBlocks.length
      ? "no-ledger-postings"
      : !hasAmounts
        ? "incomplete"
        : Math.abs(candidateNet!) <= 0.005
          ? "candidate-balanced"
          : "candidate-unbalanced";

    rows.push({
      voucherNumber: firstTag(voucher, "VOUCHERNUMBER"),
      date: firstTag(voucher, "DATE"),
      voucherType: firstTag(voucher, "VOUCHERTYPENAME"),
      guid: firstTag(voucher, "GUID"),
      ledgerEntryFamily: ledgerFamily,
      ledgerEntryCount: ledgerBlocks.length,
      ledgerAmountCount: ledgerAmounts.count,
      ledgerNet: ledgerAmounts.count ? Number(ledgerAmounts.sum.toFixed(4)) : null,
      inventoryEntryCount: inventoryBlocks.length,
      inventoryAmountCount: inventoryAmounts.count,
      inventoryNet: inventoryAmounts.count ? Number(inventoryAmounts.sum.toFixed(4)) : null,
      inventoryAccountingAllocationCount: inventoryAllocations.length,
      inventoryAccountingAllocationAmountCount: allocationAmounts.count,
      inventoryAccountingAllocationNet: allocationAmounts.count ? Number(allocationAmounts.sum.toFixed(4)) : null,
      combinedCandidateNet: candidateNet === null ? null : Number(candidateNet.toFixed(4)),
      status,
      notes,
    });
  }

  const countStatus = (status: VoucherAuditRow["status"]) => rows.filter(row => row.status === status).length;
  return {
    generatedAt: new Date().toISOString(),
    sourceFile,
    voucherCount: rows.length,
    rows,
    summary: {
      candidateBalanced: countStatus("candidate-balanced"),
      candidateUnbalanced: countStatus("candidate-unbalanced"),
      incomplete: countStatus("incomplete"),
      noLedgerPostings: countStatus("no-ledger-postings"),
      vouchersWithInventory: rows.filter(row => row.inventoryEntryCount > 0).length,
      totalInventoryEntries: rows.reduce((n, row) => n + row.inventoryEntryCount, 0),
      vouchersWithInventoryAccountingAllocations: rows.filter(row => row.inventoryAccountingAllocationCount > 0).length,
      vouchersMissingGuid: rows.filter(row => !row.guid).length,
      vouchersMissingDate: rows.filter(row => !/^\d{8}$/.test(row.date)).length,
      vouchersMissingVoucherNumber: rows.filter(row => !row.voucherNumber).length,
      ledgerFamilies,
    },
  };
}

async function main() {
  const manifestArg = process.argv[2];
  if (!manifestArg) {
    console.error("Usage: node --import tsx src/voucher-audit.ts <manifest.json>");
    process.exitCode = 2;
    return;
  }
  const manifestPath = path.resolve(manifestArg);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    company: string;
    segments: Array<{ kind: string; path: string; name: string; fromDate?: string; toDate?: string }>;
  };
  const dataSegments = manifest.segments.filter(s => s.kind === "data");
  if (!dataSegments.length) throw new Error("Manifest contains no data segments.");
  const combinedRows: VoucherAuditRow[] = [];
  const summaries: VoucherAuditReport[] = [];

  for (const segment of dataSegments) {
    const xmlPath = path.isAbsolute(segment.path)
      ? segment.path
      : path.resolve(segment.path);
    const xml = await readFile(xmlPath, "utf8");
    const report = auditVoucherXml(xml, xmlPath);
    summaries.push(report);
    combinedRows.push(...report.rows);
  }

  const tally = (status: VoucherAuditRow["status"]) => combinedRows.filter(row => row.status === status).length;
  const report = {
    generatedAt: new Date().toISOString(),
    company: manifest.company,
    manifest: manifestPath,
    dataSegmentCount: dataSegments.length,
    voucherCount: combinedRows.length,
    summary: {
      candidateBalanced: tally("candidate-balanced"),
      candidateUnbalanced: tally("candidate-unbalanced"),
      incomplete: tally("incomplete"),
      noLedgerPostings: tally("no-ledger-postings"),
      vouchersWithInventory: combinedRows.filter(row => row.inventoryEntryCount > 0).length,
      totalInventoryEntries: combinedRows.reduce((n, row) => n + row.inventoryEntryCount, 0),
      vouchersWithInventoryAccountingAllocations: combinedRows.filter(row => row.inventoryAccountingAllocationCount > 0).length,
      vouchersMissingGuid: combinedRows.filter(row => !row.guid).length,
      vouchersMissingDate: combinedRows.filter(row => !/^\d{8}$/.test(row.date)).length,
      vouchersMissingVoucherNumber: combinedRows.filter(row => !row.voucherNumber).length,
      ledgerFamilies: combinedRows.reduce((acc, row) => {
        acc[row.ledgerEntryFamily] = (acc[row.ledgerEntryFamily] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
    rows: combinedRows,
  };
  const outPath = path.join(path.dirname(manifestPath), "voucher-audit.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log("Voucher audit completed (diagnostic only; no source data changed).");
  console.log("Company:", manifest.company);
  console.log("Vouchers:", report.voucherCount);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("Detailed report:", outPath);
  console.log("IMPORTANT: candidate balance uses selected ledger entries + inventory accounting allocations; review outliers and Tally conventions before treating it as final reconciliation.");
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1].replaceAll("\\", "/")).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
