import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseTallyMasters, type TallyParsed } from "../../src/lib/tally-import.js";

type ManifestSegment = {
  name: string;
  kind: "collection" | "data";
  path: string;
  sha256: string;
  bytes: number;
  recordCount?: number;
  fromDate?: string;
  toDate?: string;
};
type SnapshotManifest = {
  schemaVersion: number;
  company: string;
  fromDate: string;
  toDate: string;
  segments: ManifestSegment[];
};
type StagingRow = {
  record_type: string;
  source_id?: string | null;
  alter_id?: string | null;
  source_key: string;
  lifecycle_state: "posted" | "cancelled" | "optional" | "deleted";
  parent_source_key?: string | null;
  payload: Record<string, unknown>;
};
type StagingBundle = {
  schemaVersion: 1;
  sourceCompanyName: string;
  sourceCompanyGuid: string | null;
  sourceChecksum: string;
  controlTotals: Record<string, number | string | null>;
  rows: StagingRow[];
};

const defaults = {
  rawGroups: ["Raw Materials", "Components", "Fabric", "Foam"],
  finishedGroups: ["Finished Goods", "Mattresses", "Products"],
};

function mergeParsed(target: TallyParsed, next: TallyParsed): void {
  for (const key of Object.keys(target) as Array<keyof TallyParsed>) {
    (target[key] as unknown[]).push(...(next[key] as unknown[]));
  }
}
function addRows(
  rows: StagingRow[],
  recordType: string,
  list: Array<Record<string, any>>,
  key: (x: Record<string, any>, index: number) => string,
  id?: (x: Record<string, any>) => string | null,
  parent?: (x: Record<string, any>) => string | null,
  alter?: (x: Record<string, any>) => string | null,
): void {
  for (const [index, item] of list.entries()) rows.push({
    record_type: recordType,
    source_id: id?.(item) ?? null,
    alter_id: alter?.(item) ?? null,
    source_key: key(item, index),
    lifecycle_state: item.lifecycle_state ?? "posted",
    parent_source_key: parent?.(item) ?? null,
    payload: item,
  });
}
async function resolveSegment(manifestPath: string, segmentPath: string): Promise<string> {
  const candidates = [
    path.isAbsolute(segmentPath) ? segmentPath : path.resolve(process.cwd(), segmentPath),
    path.resolve(path.dirname(manifestPath), path.basename(segmentPath)),
  ];
  for (const candidate of candidates) {
    try { await readFile(candidate); return candidate; } catch { /* try next */ }
  }
  throw new Error("Cannot locate snapshot segment: " + segmentPath);
}

/** Convert verified direct-bridge XML snapshots into the ERP's existing JSON staging-bundle format.
 * This only creates a local JSON file. It does not call ERP, mutate Tally, or post accounting data.
 */
export async function buildStagingBundle(manifestPath: string, outputPath: string): Promise<StagingBundle> {
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as SnapshotManifest;
  if (!manifest.company || !Array.isArray(manifest.segments) || !manifest.segments.length) {
    throw new Error("Invalid TallyBridge manifest: company or segments missing.");
  }
  const sourceCompany = manifest.company.trim().toUpperCase().replace(/\s+/g, " ");
  const allowedSources = new Set(["ABOOD TRADINGS", "ESTIMATE", "ABRAZ SLEEPING SOLUTIONS", "ABZ - EST"]);
  if (!allowedSources.has(sourceCompany)) throw new Error("Unrecognized Tally company " + manifest.company + "; refusing to create an unmapped staging bundle.");
  const parsed: TallyParsed = {
    customers: [], vendors: [], rawMaterials: [], finishedGoods: [], ledgerEntries: [],
    inventoryLines: [], groups: [], ledgers: [], godowns: [], costCentres: [], bills: [], vouchers: [],
  };
  const hash = createHash("sha256");
  hash.update(sourceCompany).update("\0").update(manifest.fromDate).update("\0").update(manifest.toDate).update("\0");
  let totalBytes = 0;
  const seenSegmentPaths = new Set<string>();
  for (const segment of manifest.segments) {
    if (!segment.path || !segment.sha256) throw new Error("Manifest segment lacks path/checksum: " + segment.name);
    const resolved = await resolveSegment(manifestPath, segment.path);
    if (seenSegmentPaths.has(resolved)) throw new Error("Duplicate manifest segment path: " + resolved);
    seenSegmentPaths.add(resolved);
    const raw = await readFile(resolved);
    const digest = createHash("sha256").update(raw).digest("hex");
    if (digest !== segment.sha256) throw new Error("SHA-256 mismatch; refusing to bundle " + resolved);
    totalBytes += raw.byteLength;
    hash.update(segment.name).update("\0").update(raw).update("\0");
    const xml = raw.toString("utf8");
    // An empty optional Tally collection may contain no TALLYMESSAGE at all.
    // It is valid to skip that segment after its checksum has been verified.
    if (!/<TALLYMESSAGE\b/i.test(xml) && !/<IMPORTDATA\b/i.test(xml)) continue;
    const result = parseTallyMasters(xml, { ...defaults, preserveLifecycle: true });
    mergeParsed(parsed, result);
  }
  // Fail closed: collection XML can differ from the TALLYMESSAGE format expected by the ERP parser.
  // Never emit a plausible-looking voucher-only bundle when master data was not parsed.
  const collectionSegments = manifest.segments.filter((segment) => segment.kind === "collection");
  if (collectionSegments.length > 0) {
    const masterCounts = [
      parsed.groups.length,
      parsed.ledgers.length,
      parsed.rawMaterials.length + parsed.finishedGoods.length,
      parsed.godowns.length,
      parsed.costCentres.length,
    ];
    const expectedMasterSegments = collectionSegments.filter((segment) =>
      /List of Groups|List of Ledgers|List of Stock Items|List of Godowns|List of Cost Centres/i.test(segment.name),
    );
    if (expectedMasterSegments.length > 0 && masterCounts.every((count) => count === 0)) {
      throw new Error(
        "Master collections were present but parsed as zero records. Refusing to create an incomplete bundle. " +
        "The direct collection XML format needs a dedicated parser before migration can continue.",
      );
    }
  }

  const rows: StagingRow[] = [];
  addRows(rows, "group", parsed.groups as any, x => `group:${x.parent ?? ""}:${x.name}`, x => x.name);
  addRows(rows, "ledger", parsed.ledgers as any, x => `ledger:${x.name}`, x => x.name, x => x.parent ? `group::${x.parent}` : null);
  addRows(rows, "stock_item", [...parsed.rawMaterials, ...parsed.finishedGoods] as any, x => `stock:${x.name}`, x => x.name);
  addRows(rows, "godown", parsed.godowns as any, x => `godown:${x.parent ?? ""}:${x.name}`, x => x.name);
  addRows(rows, "cost_center", parsed.costCentres as any, x => `cost:center:${x.parent ?? ""}:${x.name}`, x => x.name);
  addRows(rows, "party", parsed.customers as any, x => `party:customer:${x.name}`, x => x.name);
  addRows(rows, "party", parsed.vendors as any, x => `party:vendor:${x.name}`, x => x.name);
  addRows(rows, "opening_balance", parsed.customers.filter(x => x.opening_balance !== 0) as any, x => `opening:customer:${x.name}`);
  addRows(rows, "opening_balance", parsed.vendors.filter(x => x.opening_balance !== 0) as any, x => `opening:vendor:${x.name}`);
  addRows(rows, "voucher", parsed.vouchers as any, x => `voucher:${x.source_id}`, x => x.source_id, undefined, x => x.alter_id ?? null);
  addRows(rows, "inventory_line", parsed.inventoryLines as any, x => `inventory:${x.voucher_guid}:${x.line_index}`, x => x.voucher_guid, x => `voucher:${x.voucher_guid}`);
  addRows(rows, "ledger", parsed.ledgerEntries as any, (x, index) => `ledger-entry:${x.external_ref}:${index}`, x => x.external_ref);
  addRows(rows, "bill", parsed.bills as any, x => `bill:${x.external_ref}`, x => x.external_ref);
  const stockOpen = [...parsed.rawMaterials, ...parsed.finishedGoods].filter(x => x.opening_qty !== 0 || x.opening_rate !== 0);
  addRows(rows, "inventory_line", stockOpen as any, x => `stock-opening:${x.name}`, x => x.name);

  if (!rows.length) throw new Error("No source rows parsed; refusing to create an empty bundle.");
  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();
  for (const row of rows) {
    const composite = row.record_type + "\0" + row.source_key;
    if (seenKeys.has(composite)) duplicateKeys.add(composite);
    seenKeys.add(composite);
  }
  if (duplicateKeys.size) throw new Error("Duplicate record-type/source-key combinations (" + duplicateKeys.size + "); resolve before staging.");

  const debit = parsed.vouchers.reduce((sum, v) => sum + v.entries.reduce((a, e) => a + e.debit, 0), 0);
  const credit = parsed.vouchers.reduce((sum, v) => sum + v.entries.reduce((a, e) => a + e.credit, 0), 0);
  const bundle: StagingBundle = {
    schemaVersion: 1,
    sourceCompanyName: manifest.company,
    sourceCompanyGuid: null,
    sourceChecksum: hash.digest("hex"),
    controlTotals: {
      sourceBytes: totalBytes,
      sourceSegments: manifest.segments.length,
      vouchers: parsed.vouchers.length,
      inventoryLines: parsed.inventoryLines.length,
      voucherDebit: Number(debit.toFixed(2)),
      voucherCredit: Number(credit.toFixed(2)),
      customers: parsed.customers.length,
      vendors: parsed.vendors.length,
      ledgers: parsed.ledgers.length,
      groups: parsed.groups.length,
      stockItems: parsed.rawMaterials.length + parsed.finishedGoods.length,
      godowns: parsed.godowns.length,
      costCentres: parsed.costCentres.length,
      bills: parsed.bills.length,
      rows: rows.length,
    },
    rows,
  };
  await writeFile(outputPath, JSON.stringify(bundle), "utf8");
  return bundle;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const manifestPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!manifestPath || !outputPath) {
    console.error("Usage: node --import tsx src/migration-bundle.ts <manifest.json> <output-bundle.json>");
    process.exitCode = 2;
  } else {
    const bundle = await buildStagingBundle(manifestPath, outputPath);
    console.log("[migration-bundle] Created local staging bundle (not uploaded or posted).");
    console.log(JSON.stringify({ company: bundle.sourceCompanyName, rows: bundle.rows.length, checksum: bundle.sourceChecksum, controlTotals: bundle.controlTotals }, null, 2));
  }
}
