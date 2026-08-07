import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { parseTallyMasters, TallyXmlError, type TallyParsed } from "@/lib/tally-import";
import { importTallyMasters, recomputeTallyBalances, type TallyImportResult } from "@/lib/tally-import.functions";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_app/tally-import")({
  component: TallyImportPage,
});

/**
 * Read an uploaded Tally XML file, auto-detecting UTF-8, UTF-16 LE/BE, and
 * declared encodings so exports from Tally.ERP 9 (UTF-16) and TallyPrime
 * (UTF-8) both parse. `File.text()` alone always decodes as UTF-8 and
 * garbles UTF-16 exports.
 */
async function readXmlFile(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  // BOM sniffing
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf.subarray(2));
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf.subarray(2));
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buf.subarray(3));
  }
  // Heuristic: many zero bytes = UTF-16 without BOM (Tally.ERP 9 default)
  let zeros = 0;
  const sample = Math.min(buf.length, 512);
  for (let i = 0; i < sample; i++) if (buf[i] === 0) zeros++;
  if (sample > 0 && zeros / sample > 0.2) {
    const le = new TextDecoder("utf-16le").decode(buf);
    if (le.includes("<")) return le;
    return new TextDecoder("utf-16be").decode(buf);
  }
  // Default UTF-8; honor an explicit encoding= attribute if present
  const utf8 = new TextDecoder("utf-8").decode(buf);
  const enc = utf8.slice(0, 200).match(/encoding=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  if (enc && enc !== "utf-8" && enc !== "utf8") {
    try {
      return new TextDecoder(enc).decode(buf);
    } catch {
      // fall through
    }
  }
  return utf8;
}

function TallyImportPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const runImport = useServerFn(importTallyMasters);
  const runRecompute = useServerFn(recomputeTallyBalances);

  const [rawGroups, setRawGroups] = useState("Raw Materials, Components, Fabric, Foam");
  const [finishedGroups, setFinishedGroups] = useState("Finished Goods, Mattresses, Products");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsed, setParsed] = useState<TallyParsed | null>(null);
  const [result, setResult] = useState<TallyImportResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  if (!hasRole("admin")) {
    return (
      <PageBody>
        <Card><CardContent className="p-8 text-center text-muted-foreground">Only admins can import Tally data.</CardContent></Card>
      </PageBody>
    );
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    setParsing(true);
    try {
      const xml = await readXmlFile(f);
      const out = parseTallyMasters(xml, {
        rawGroups: rawGroups.split(",").map((s) => s.trim()).filter(Boolean),
        finishedGroups: finishedGroups.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setParsed(out);
      const total = out.customers.length + out.vendors.length + out.rawMaterials.length + out.finishedGoods.length;
      if (total === 0) toast.warning("No masters found in this XML. Make sure you exported Masters from Tally.");
      else toast.success(`Parsed ${total} records. Review and import.`);
    } catch (err) {
      if (err instanceof TallyXmlError) {
        toast.error(err.message, { description: err.hint, duration: 10000 });
      } else {
        toast.error("Could not read this file.", {
          description: "Please upload a valid Tally XML export (Alt + E → XML).",
          duration: 8000,
        });
      }
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };

  const commit = async () => {
    if (!parsed) return;
    setImporting(true);
    setResult(null);

    // Chunk sizes chosen so each server-fn call finishes well inside the
    // edge worker's request budget even on cold starts. Masters loop over
    // rows one-by-one on the server (needs small slices); ledger entries
    // use bulk chunk-insert (can be larger).
    const MASTER_CHUNK = 250;
    const LEDGER_CHUNK = 2000;

    const chunks: Array<{ label: string; payload: Record<string, unknown> }> = [];
    const push = <T,>(arr: T[], size: number, key: "customers" | "vendors" | "rawMaterials" | "finishedGoods" | "ledgerEntries" | "groups" | "ledgers" | "godowns" | "costCentres", label: string) => {
      for (let i = 0; i < arr.length; i += size) {
        chunks.push({
          label: `${label} ${Math.min(i + size, arr.length)}/${arr.length}`,
          payload: {
            customers: [], vendors: [], rawMaterials: [], finishedGoods: [], ledgerEntries: [],
            groups: [], ledgers: [], godowns: [], costCentres: [],
            skipRecompute: true,
            [key]: arr.slice(i, i + size),
          } as any,
        });
      }
    };
    // Groups first so ledger accounts can resolve their parent group.
    push(parsed.groups, MASTER_CHUNK, "groups", "Account groups");
    push(parsed.ledgers, MASTER_CHUNK, "ledgers", "Ledger accounts");
    push(parsed.godowns, MASTER_CHUNK, "godowns", "Godowns");
    push(parsed.costCentres, MASTER_CHUNK, "costCentres", "Cost centres");
    push(parsed.customers, MASTER_CHUNK, "customers", "Customers");
    push(parsed.vendors, MASTER_CHUNK, "vendors", "Vendors");
    push(parsed.rawMaterials, MASTER_CHUNK, "rawMaterials", "Raw materials");
    push(parsed.finishedGoods, MASTER_CHUNK, "finishedGoods", "Finished goods");
    push(parsed.ledgerEntries, LEDGER_CHUNK, "ledgerEntries", "Ledger entries");

    // Aggregate results across chunks.
    const agg: TallyImportResult = {
      customers: { inserted: 0, updated: 0 },
      vendors: { inserted: 0, updated: 0 },
      rawMaterials: { inserted: 0, updated: 0 },
      finishedGoods: { inserted: 0, updated: 0 },
      partyLedgerEntries: { inserted: 0, skipped: 0 },
      supplierLedgerEntries: { inserted: 0, skipped: 0 },
      ledgerGroups: { inserted: 0, updated: 0 },
      ledgerAccounts: { inserted: 0, updated: 0 },
      godowns: { inserted: 0, updated: 0 },
      costCentres: { inserted: 0, updated: 0 },
      unmatchedLedgerNames: [],
      errors: [],
      touchedPartyIds: [],
      touchedSupplierIds: [],
    };

    const unmatched = new Set<string>();
    const touchedParties = new Set<string>();
    const touchedSuppliers = new Set<string>();

    const total = chunks.length + 1; // +1 for the finalize step
    setProgress({ done: 0, total, label: chunks.length ? chunks[0].label : "Finalize" });

    try {
      for (let i = 0; i < chunks.length; i++) {
        const { label, payload } = chunks[i];
        setProgress({ done: i, total, label });
        const res = await runImport({ data: payload });
        agg.customers.inserted += res.customers.inserted; agg.customers.updated += res.customers.updated;
        agg.vendors.inserted += res.vendors.inserted; agg.vendors.updated += res.vendors.updated;
        agg.rawMaterials.inserted += res.rawMaterials.inserted; agg.rawMaterials.updated += res.rawMaterials.updated;
        agg.finishedGoods.inserted += res.finishedGoods.inserted; agg.finishedGoods.updated += res.finishedGoods.updated;
        agg.partyLedgerEntries.inserted += res.partyLedgerEntries.inserted;
        agg.partyLedgerEntries.skipped += res.partyLedgerEntries.skipped;
        agg.supplierLedgerEntries.inserted += res.supplierLedgerEntries.inserted;
        agg.supplierLedgerEntries.skipped += res.supplierLedgerEntries.skipped;
        agg.ledgerGroups.inserted += res.ledgerGroups.inserted; agg.ledgerGroups.updated += res.ledgerGroups.updated;
        agg.ledgerAccounts.inserted += res.ledgerAccounts.inserted; agg.ledgerAccounts.updated += res.ledgerAccounts.updated;
        agg.godowns.inserted += res.godowns.inserted; agg.godowns.updated += res.godowns.updated;
        agg.costCentres.inserted += res.costCentres.inserted; agg.costCentres.updated += res.costCentres.updated;
        agg.errors.push(...res.errors);

        res.unmatchedLedgerNames.forEach((n) => unmatched.add(n));
        res.touchedPartyIds.forEach((id) => touchedParties.add(id));
        res.touchedSupplierIds.forEach((id) => touchedSuppliers.add(id));
      }

      // Finalize: recompute balances in batches (server caps at 2000 ids/call).
      setProgress({ done: chunks.length, total, label: "Recomputing balances" });
      const RECOMP_BATCH = 1000;
      const partyIds = Array.from(touchedParties);
      const supplierIds = Array.from(touchedSuppliers);
      const maxLen = Math.max(partyIds.length, supplierIds.length);
      for (let i = 0; i < maxLen; i += RECOMP_BATCH) {
        await runRecompute({
          data: {
            partyIds: partyIds.slice(i, i + RECOMP_BATCH),
            supplierIds: supplierIds.slice(i, i + RECOMP_BATCH),
          },
        });
      }

      agg.unmatchedLedgerNames = Array.from(unmatched).slice(0, 100);
      agg.touchedPartyIds = partyIds;
      agg.touchedSupplierIds = supplierIds;
      setResult(agg);
      qc.invalidateQueries();
      const totals =
        agg.customers.inserted + agg.customers.updated +
        agg.vendors.inserted + agg.vendors.updated +
        agg.rawMaterials.inserted + agg.rawMaterials.updated +
        agg.finishedGoods.inserted + agg.finishedGoods.updated;
      toast.success(`Imported ${totals} records${agg.errors.length ? ` with ${agg.errors.length} errors` : ""}.`);
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
      // Preserve whatever progress we made so the admin can inspect it.
      if (agg.customers.inserted || agg.vendors.inserted || agg.partyLedgerEntries.inserted) setResult(agg);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Import from Tally"
        description="Upload a Tally Masters XML export to bring in customers, vendors, raw materials and finished goods."
      />
      <PageBody>
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">How to export from Tally (Tally ERP 9 & TallyPrime 3/4/5)</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p><b>Masters (customers, vendors, stock, opening balances):</b> Gateway of Tally → Display More Reports → List of Accounts (TallyPrime: Chart of Accounts) → <b>Alt + E → Export</b> as XML.</p>
            <p><b>Ledger / current balances (voucher entries):</b> Gateway of Tally → Display More Reports → Day Book (or open a specific party's Ledger) → <b>Alt + E → Export</b> as XML. Upload that XML here too — the importer reads both masters and vouchers from any Tally XML.</p>
            <p className="text-xs">Cancelled, optional, and deleted vouchers are automatically skipped. GSTIN is picked up from either the flat <code>PARTYGSTIN</code> tag or the nested <code>GSTREGDETAILS.LIST</code> used by TallyPrime 4+. After import, each customer's and vendor's <b>current balance</b> is recalculated as <code>opening balance + sum of debits − sum of credits</code> from the imported ledger entries.</p>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3 mb-4">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">1. Stock group mapping</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Tally groups treated as Raw Materials (comma-separated, case-insensitive partial match)</Label>
                <Input value={rawGroups} onChange={(e) => setRawGroups(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Tally groups treated as Finished Goods</Label>
                <Input value={finishedGroups} onChange={(e) => setFinishedGroups(e.target.value)} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">2. Upload XML</CardTitle></CardHeader>
            <CardContent>
              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 cursor-pointer hover:bg-muted/30 transition">
                <FileUp className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{fileName || "Choose Tally XML file"}</span>
                <input type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={onFile} disabled={parsing} />
              </label>
            </CardContent>
          </Card>
        </div>

        {parsed && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>3. Preview & import</span>
                <Button onClick={commit} disabled={importing} className="btn-3d">
                  <Upload className="h-4 w-4 mr-1" />
                  {importing ? "Importing…" : "Import to database"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {progress && (
                <div className="mb-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progress.label}</span>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
                </div>
              )}
              <div className="grid gap-3 grid-cols-2 md:grid-cols-5 mb-4">
                <Stat label="Customers" value={parsed.customers.length} />
                <Stat label="Vendors" value={parsed.vendors.length} />
                <Stat label="Raw materials" value={parsed.rawMaterials.length} />
                <Stat label="Finished goods" value={parsed.finishedGoods.length} />
                <Stat label="Ledger entries" value={parsed.ledgerEntries.length} />
                <Stat label="Account groups" value={parsed.groups.length} />
                <Stat label="Ledger accounts" value={parsed.ledgers.length} />
                <Stat label="Godowns" value={parsed.godowns.length} />
                <Stat label="Cost centres" value={parsed.costCentres.length} />
                <Stat label="Bill references" value={parsed.bills.length} />
              </div>

              <Tabs defaultValue="outstanding">
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="outstanding">Outstanding balances</TabsTrigger>
                  <TabsTrigger value="customers">Customers</TabsTrigger>
                  <TabsTrigger value="vendors">Vendors</TabsTrigger>
                  <TabsTrigger value="raw">Raw materials</TabsTrigger>
                  <TabsTrigger value="finished">Finished goods</TabsTrigger>
                  <TabsTrigger value="ledger">Ledger entries</TabsTrigger>
                  <TabsTrigger value="coa">Chart of accounts</TabsTrigger>
                  <TabsTrigger value="other">Godowns & cost centres</TabsTrigger>
                </TabsList>
                <TabsContent value="outstanding"><OutstandingTable customers={parsed.customers} vendors={parsed.vendors} /></TabsContent>
                <TabsContent value="customers"><PartyTable rows={parsed.customers} /></TabsContent>
                <TabsContent value="vendors"><PartyTable rows={parsed.vendors} /></TabsContent>
                <TabsContent value="raw"><StockTable rows={parsed.rawMaterials} /></TabsContent>
                <TabsContent value="finished"><StockTable rows={parsed.finishedGoods} /></TabsContent>
                <TabsContent value="ledger"><LedgerTable rows={parsed.ledgerEntries} /></TabsContent>
                <TabsContent value="coa"><ChartOfAccountsTable groups={parsed.groups} ledgers={parsed.ledgers} /></TabsContent>
                <TabsContent value="other"><NamedTable rows={[...parsed.godowns.map((g) => ({ name: g.name, kind: "Godown", parent: g.parent })), ...parsed.costCentres.map((c) => ({ name: c.name, kind: "Cost centre", parent: c.parent }))]} /></TabsContent>
              </Tabs>

            </CardContent>
          </Card>
        )}

        {result && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Import results</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-3">
                <ResultStat label="Customers" inserted={result.customers.inserted} updated={result.customers.updated} />
                <ResultStat label="Vendors" inserted={result.vendors.inserted} updated={result.vendors.updated} />
                <ResultStat label="Raw materials" inserted={result.rawMaterials.inserted} updated={result.rawMaterials.updated} />
                <ResultStat label="Finished goods" inserted={result.finishedGoods.inserted} updated={result.finishedGoods.updated} />
              </div>
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 mb-3">
                <div className="rounded-xl glass-sm p-3">
                  <div className="text-xs text-muted-foreground">Customer ledger entries</div>
                  <div className="mt-1 text-sm">
                    <span className="text-emerald-500 font-medium">+{result.partyLedgerEntries.inserted}</span> inserted ·{" "}
                    <span className="text-muted-foreground">{result.partyLedgerEntries.skipped}</span> already present
                  </div>
                </div>
                <div className="rounded-xl glass-sm p-3">
                  <div className="text-xs text-muted-foreground">Vendor ledger entries</div>
                  <div className="mt-1 text-sm">
                    <span className="text-emerald-500 font-medium">+{result.supplierLedgerEntries.inserted}</span> inserted ·{" "}
                    <span className="text-muted-foreground">{result.supplierLedgerEntries.skipped}</span> already present
                  </div>
                </div>
              </div>
              {result.unmatchedLedgerNames.length > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 mb-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-warning mb-2">
                    <AlertTriangle className="h-4 w-4" /> {result.unmatchedLedgerNames.length} ledger name(s) had no matching customer/vendor — entries skipped
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
                    {result.unmatchedLedgerNames.slice(0, 30).map((n, i) => <li key={i}>• {n}</li>)}
                  </ul>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-warning mb-2">
                    <AlertTriangle className="h-4 w-4" /> {result.errors.length} record(s) had errors
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
                    {result.errors.slice(0, 50).map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl glass-sm p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function ResultStat({ label, inserted, updated }: { label: string; inserted: number; updated: number }) {
  return (
    <div className="rounded-xl glass-sm p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm"><span className="text-emerald-500 font-medium">+{inserted}</span> new · <span className="text-primary font-medium">{updated}</span> updated</div>
    </div>
  );
}

function LedgerTable({ rows }: { rows: Array<{ party_name: string; entry_date: string; voucher_type: string | null; voucher_number: string | null; debit: number; credit: number }> }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">No voucher entries found in this XML. Export a Day Book or Ledger XML to bring in transactions.</p>;
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Party</TableHead><TableHead>Voucher</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.slice(0, 200).map((r, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs">{r.entry_date}</TableCell>
              <TableCell className="font-medium">{r.party_name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.voucher_type ?? "—"} {r.voucher_number ?? ""}</TableCell>
              <TableCell className="text-right">{r.debit.toFixed(2)}</TableCell>
              <TableCell className="text-right">{r.credit.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > 200 && <p className="text-xs text-muted-foreground p-2">Showing first 200 of {rows.length}.</p>}
    </div>
  );
}

function PartyTable({ rows }: { rows: Array<{ name: string; gstin?: string | null; phone?: string | null; opening_balance: number; closing_balance: number }> }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">None found.</p>;
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>GSTIN</TableHead><TableHead className="text-right">Opening</TableHead><TableHead className="text-right">Closing</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.slice(0, 200).map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.gstin ?? "—"}</TableCell>
              <TableCell className="text-right">{r.opening_balance.toFixed(2)}</TableCell>
              <TableCell className="text-right">{r.closing_balance.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > 200 && <p className="text-xs text-muted-foreground p-2">Showing first 200 of {rows.length}.</p>}
    </div>
  );
}

function StockTable({ rows }: { rows: Array<{ name: string; unit: string; opening_qty: number; opening_rate: number; group: string }> }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">None found.</p>;
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Group</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.slice(0, 200).map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.group}</TableCell>
              <TableCell>{r.unit}</TableCell>
              <TableCell className="text-right">{r.opening_qty}</TableCell>
              <TableCell className="text-right">{r.opening_rate.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > 200 && <p className="text-xs text-muted-foreground p-2">Showing first 200 of {rows.length}.</p>}
    </div>
  );
}
