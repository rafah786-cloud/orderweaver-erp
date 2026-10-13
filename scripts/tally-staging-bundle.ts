import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseTallyMasters, type TallyParsed } from "../src/lib/tally-import.js";

type Manifest = {
  company: string;
  segments: Array<{
    kind: string;
    name: string;
    path: string;
    sha256: string;
    fromDate?: string;
    toDate?: string;
  }>;
};
type StagingRow = {
  record_type: string;
  source_id: string | null;
  alter_id: string | null;
  source_key: string;
  lifecycle_state: "posted" | "cancelled" | "optional" | "deleted";
  parent_source_key: string | null;
  payload: Record<string, unknown>;
};
const lifecycle = (value: unknown): StagingRow["lifecycle_state"] =>
  value === "cancelled" || value === "optional" || value === "deleted" ? value : "posted";

function messages(xml: string): string[] {
  return [...xml.matchAll(/<TALLYMESSAGE\b[^>]*>([\s\S]*?)<\/TALLYMESSAGE>/gi)].map((m) => m[1]);
}
function combinedXml(parts: string[]): string {
  const all = parts.flatMap(messages);
  if (!all.length) throw new Error("No TALLYMESSAGE objects found in one or more source XML segments.");
  return "<ENVELOPE><BODY><DATA>" + all.map((m) => "<TALLYMESSAGE>" + m + "</TALLYMESSAGE>").join("") + "</DATA></BODY></ENVELOPE>";
}
function rowsFor(parsed: TallyParsed, includeMasters: boolean): StagingRow[] {
  const rows: StagingRow[] = [];
  const add = (
    record_type: string,
    list: any[],
    keyFn: (x: any, i: number) => string,
    idFn?: (x: any) => string | null,
    parentFn?: (x: any) => string | null,
    alterIdFn: (x: any) => string | null = (x) => x.alter_id ?? null,
  ) => list.forEach((x, i) => rows.push({
    record_type,
    source_id: idFn?.(x) ?? null,
    alter_id: alterIdFn?.(x) ?? null,
    source_key: keyFn(x, i),
    lifecycle_state: lifecycle(x.lifecycle_state),
    parent_source_key: parentFn?.(x) ?? null,
    payload: x as Record<string, unknown>,
  }));

  if (includeMasters) {
    add("group", parsed.groups, (x) => `group:${x.parent ?? ""}:${x.name}`, (x) => x.source_guid ?? x.master_id ?? x.name);
    add("ledger", parsed.ledgers, (x) => `ledger:${x.name}`, (x) => x.source_guid ?? x.master_id ?? x.name, (x) => x.parent ? `group::${x.parent}` : null);
    add("stock_item", [...parsed.rawMaterials, ...parsed.finishedGoods], (x) => `stock:${x.name}`, (x) => x.source_guid ?? x.master_id ?? x.name);
    add("godown", parsed.godowns, (x) => `godown:${x.parent ?? ""}:${x.name}`, (x) => x.source_guid ?? x.master_id ?? x.name);
    add("cost_center", parsed.costCentres, (x) => `cost:center:${x.parent ?? ""}:${x.name}`, (x) => x.source_guid ?? x.master_id ?? x.name);
    add("party", parsed.customers, (x) => `party:customer:${x.name}`, (x) => x.source_guid ?? x.master_id ?? x.name);
    add("party", parsed.vendors, (x) => `party:vendor:${x.name}`, (x) => x.source_guid ?? x.master_id ?? x.name);
    add("opening_balance", parsed.customers.filter((x) => x.opening_balance !== 0), (x) => `opening:customer:${x.name}`);
    add("opening_balance", parsed.vendors.filter((x) => x.opening_balance !== 0), (x) => `opening:vendor:${x.name}`);
    const stockOpen = [...parsed.rawMaterials, ...parsed.finishedGoods].filter((x) => x.opening_qty !== 0 || x.opening_rate !== 0);
    add("inventory_line", stockOpen, (x) => `stock-opening:${x.name}`, (x) => x.source_guid ?? x.master_id ?? x.name);
    add("bill", parsed.bills.filter((b) => b.voucher_guid === null), (x) => `bill:${x.external_ref}`, (x) => x.external_ref);
  }

  add("voucher", parsed.vouchers, (x) => `voucher:${x.source_id}`, (x) => x.source_id);
  const inventoryRows = parsed.vouchers.flatMap((voucher) => voucher.inventory_entries.map((entry, lineIndex) => ({
    ...entry,
    voucher_guid: voucher.source_id,
    line_index: lineIndex,
    lifecycle_state: voucher.lifecycle_state,
    source_payload: voucher.source_payload ?? voucher,
  })));
  add("inventory_line", inventoryRows, (x) => `inventory:${x.voucher_guid}:${x.line_index}`, (x) => x.voucher_guid, (x) => `voucher:${x.voucher_guid}`, () => null);
  add("ledger", parsed.ledgerEntries, (x) => `ledger-entry:${x.external_ref}`, (x) => x.external_ref, undefined, () => null);
  add("bill", parsed.bills.filter((b) => b.voucher_guid !== null), (x) => `bill:${x.external_ref}`, (x) => x.external_ref);
  return rows;
}
function controls(parsed: TallyParsed, includeMasters: boolean) {
  return {
    vouchers: parsed.vouchers.length,
    inventoryLines: parsed.vouchers.reduce((n, v) => n + v.inventory_entries.length, 0),
    voucherDebit: parsed.vouchers.reduce((sum, v) => sum + v.entries.reduce((n, e) => n + e.debit, 0), 0),
    voucherCredit: parsed.vouchers.reduce((sum, v) => sum + v.entries.reduce((n, e) => n + e.credit, 0), 0),
    customers: includeMasters ? parsed.customers.length : 0,
    vendors: includeMasters ? parsed.vendors.length : 0,
    ledgers: includeMasters ? parsed.ledgers.length : 0,
    groups: includeMasters ? parsed.groups.length : 0,
    stockItems: includeMasters ? parsed.rawMaterials.length + parsed.finishedGoods.length : 0,
    godowns: includeMasters ? parsed.godowns.length : 0,
    costCentres: includeMasters ? parsed.costCentres.length : 0,
    bills: parsed.bills.filter((b) => includeMasters || b.voucher_guid !== null).length,
  };
}

/** Build read-only ERP staging packages. No live ERP or Tally writes are performed. */
async function main() {
  const manifestArg = process.argv[2];
  const outputArg = process.argv[3];
  if (!manifestArg || !outputArg) {
    throw new Error("Usage: node --import tsx src/staging-bundle.ts <manifest.json> <output-directory>");
  }
  const manifestPath = path.resolve(manifestArg);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const masters = manifest.segments.filter((s) => s.kind === "collection");
  const periods = manifest.segments.filter((s) => s.kind === "data");
  if (!masters.length) throw new Error("Snapshot manifest has no master collections.");
  if (!periods.length) throw new Error("Snapshot manifest has no Voucher Register data segments.");

  const masterXml = await Promise.all(masters.map((s) => readFile(path.resolve(s.path), "utf8")));
  const masterHash = masters.map((s) => s.sha256).sort().join("|");
  const outDir = path.resolve(outputArg);
  await mkdir(outDir, { recursive: true });

  for (let i = 0; i < periods.length; i++) {
    const segment = periods[i];
    const voucherXml = await readFile(path.resolve(segment.path), "utf8");
    const xml = combinedXml([...masterXml, voucherXml]);
    const parsed = parseTallyMasters(xml, {
      rawGroups: ["Raw Materials", "Components", "Fabric", "Foam"],
      finishedGroups: ["Finished Goods", "Mattresses", "Products"],
      preserveLifecycle: true,
    });
    const includeMasters = i === 0;
    const rows = rowsFor(parsed, includeMasters);
    const checksum = createHash("sha256")
      .update(manifest.company + "|" + masterHash + "|" + segment.sha256)
      .digest("hex");
    const bundle = {
      schemaVersion: 1,
      sourceCompanyName: manifest.company,
      sourceCompanyGuid: parsed.sourceCompanies?.find((c) => c.guid)?.guid ?? null,
      sourceChecksum: checksum,
      sourcePeriod: { fromDate: segment.fromDate ?? null, toDate: segment.toDate ?? null },
      controlTotals: controls(parsed, includeMasters),
      rows,
    };
    const name = "staging-bundle-" + String(i + 1).padStart(4, "0") + ".json";
    await writeFile(path.join(outDir, name), JSON.stringify(bundle), "utf8");
    console.log("[staging-bundle] " + name + ": " + rows.length + " rows; " + parsed.vouchers.length + " vouchers; masters=" + (includeMasters ? "included" : "not repeated"));
  }
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    sourceCompanyName: manifest.company,
    sourceManifest: manifestPath,
    bundleCount: periods.length,
    bundles: periods.map((s, i) => ({
      file: "staging-bundle-" + String(i + 1).padStart(4, "0") + ".json",
      fromDate: s.fromDate ?? null,
      toDate: s.toDate ?? null,
      sourceSha256: s.sha256,
    })),
  }, null, 2), "utf8");
  console.log("[staging-bundle] Complete. Bundles are staged-data packages only; no ERP or Tally writes were performed.");
}
await main();
