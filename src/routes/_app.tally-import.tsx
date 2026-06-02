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
import { parseTallyMasters, type TallyParsed } from "@/lib/tally-import";
import { importTallyMasters, type TallyImportResult } from "@/lib/tally-import.functions";

export const Route = createFileRoute("/_app/tally-import")({
  component: TallyImportPage,
});

function TallyImportPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const runImport = useServerFn(importTallyMasters);

  const [rawGroups, setRawGroups] = useState("Raw Materials, Components, Fabric, Foam");
  const [finishedGroups, setFinishedGroups] = useState("Finished Goods, Mattresses, Products");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsed, setParsed] = useState<TallyParsed | null>(null);
  const [result, setResult] = useState<TallyImportResult | null>(null);
  const [fileName, setFileName] = useState<string>("");

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
      const xml = await f.text();
      const out = parseTallyMasters(xml, {
        rawGroups: rawGroups.split(",").map((s) => s.trim()).filter(Boolean),
        finishedGroups: finishedGroups.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setParsed(out);
      const total = out.customers.length + out.vendors.length + out.rawMaterials.length + out.finishedGoods.length;
      if (total === 0) toast.warning("No masters found in this XML. Make sure you exported Masters from Tally.");
      else toast.success(`Parsed ${total} records. Review and import.`);
    } catch (err) {
      toast.error(`Failed to parse XML: ${(err as Error).message}`);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };

  const commit = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await runImport({ data: parsed });
      setResult(res);
      qc.invalidateQueries();
      const totals =
        res.customers.inserted + res.customers.updated +
        res.vendors.inserted + res.vendors.updated +
        res.rawMaterials.inserted + res.rawMaterials.updated +
        res.finishedGoods.inserted + res.finishedGoods.updated;
      toast.success(`Imported ${totals} records${res.errors.length ? ` with ${res.errors.length} errors` : ""}.`);
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
    } finally {
      setImporting(false);
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
          <CardHeader><CardTitle className="text-base">How to export from Tally</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p><b>Masters (customers, vendors, stock, opening balances):</b> Gateway of Tally → Display More Reports → List of Accounts → <b>Alt + E → Export</b> as XML.</p>
            <p><b>Ledger / current balances (voucher entries):</b> Gateway of Tally → Display More Reports → Day Book (or open a specific party's Ledger) → <b>Alt + E → Export</b> as XML. Upload that XML here too — the importer will read both masters and vouchers from any Tally XML.</p>
            <p className="text-xs">After import, each customer's and vendor's <b>current balance</b> is recalculated as <code>opening balance + sum of debits − sum of credits</code> from the imported ledger entries. Outstanding values across dashboards update automatically.</p>
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
              <div className="grid gap-3 grid-cols-2 md:grid-cols-5 mb-4">
                <Stat label="Customers" value={parsed.customers.length} />
                <Stat label="Vendors" value={parsed.vendors.length} />
                <Stat label="Raw materials" value={parsed.rawMaterials.length} />
                <Stat label="Finished goods" value={parsed.finishedGoods.length} />
                <Stat label="Ledger entries" value={parsed.ledgerEntries.length} />
              </div>

              <Tabs defaultValue="customers">
                <TabsList>
                  <TabsTrigger value="customers">Customers</TabsTrigger>
                  <TabsTrigger value="vendors">Vendors</TabsTrigger>
                  <TabsTrigger value="raw">Raw materials</TabsTrigger>
                  <TabsTrigger value="finished">Finished goods</TabsTrigger>
                  <TabsTrigger value="ledger">Ledger entries</TabsTrigger>
                </TabsList>
                <TabsContent value="customers"><PartyTable rows={parsed.customers} /></TabsContent>
                <TabsContent value="vendors"><PartyTable rows={parsed.vendors} /></TabsContent>
                <TabsContent value="raw"><StockTable rows={parsed.rawMaterials} /></TabsContent>
                <TabsContent value="finished"><StockTable rows={parsed.finishedGoods} /></TabsContent>
                <TabsContent value="ledger"><LedgerTable rows={parsed.ledgerEntries} /></TabsContent>
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

function PartyTable({ rows }: { rows: Array<{ name: string; gstin?: string | null; phone?: string | null; opening_balance: number }> }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-6 text-center">None found.</p>;
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>GSTIN</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Opening Bal</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.slice(0, 200).map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.gstin ?? "—"}</TableCell>
              <TableCell className="text-xs">{r.phone ?? "—"}</TableCell>
              <TableCell className="text-right">{r.opening_balance.toFixed(2)}</TableCell>
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
