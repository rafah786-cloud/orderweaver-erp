import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cable, FileUp, RefreshCw, ShieldAlert, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOCAL_TALLY_URL, previewLocalTally, readLocalTallyFile, validAccountingDate, type LocalTallyPreview, type LocalTallyCompany } from "@/lib/local-tally";
import { TallyArchiveUploader } from "@/components/TallyArchiveUploader";

export function LocalTallyAccounts() {
  const [source, setSource] = useState("xml");
  const [key, setKey] = useState("");
  const [companies, setCompanies] = useState<LocalTallyCompany[]>([]);
  const [companyGuid, setCompanyGuid] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<LocalTallyPreview | null>(null);
  const [validated, setValidated] = useState(false);
  const [filename, setFilename] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const reset = () => { sequence.current++; setReport(null); setValidated(false); setError(null); setFilename(""); setBusy(false); };
  const request = async (path: string) => {
    const response = await fetch(LOCAL_TALLY_URL + path, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(130000), cache: "no-store" });
    if (response.status === 401) throw new Error("Local bridge pairing key was rejected.");
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(typeof body?.error === "string" ? body.error : `Local bridge rejected the request (${response.status}).`);
    }
    return response.json();
  };
  const testConnection = async () => {
    setBusy(true); setError(null); setConnectedAt(null); setCompanies([]); setCompanyGuid("");
    try {
      if (key.length < 32) throw new Error("Enter the pairing key configured on the Tally PC (at least 32 characters).");
      const result = await request("/companies");
      if (result.protocol !== 1 || !Array.isArray(result.companies) || !result.companies.length || result.companies.some((c: LocalTallyCompany) => !c.name || !c.guid)) throw new Error("Bridge returned no verifiable company identities.");
      setCompanies(result.companies); setConnectedAt(new Date().toISOString());
    } catch (e) { setError(e instanceof TypeError ? "Cannot reach the local bridge. Start it on this PC, load TallyPrime, and allow local-network access in your browser." : e instanceof Error ? e.message : "Connection failed."); }
    finally { setBusy(false); }
  };
  const exportLive = async () => {
    const current = ++sequence.current;
    setBusy(true); setError(null); setReport(null); setValidated(false);
    try {
      if (!companyGuid || !validAccountingDate(from) || !validAccountingDate(to) || from > to) throw new Error("Choose a company and an ordered date range.");
      const bodies: string[] = [];
      for (const kind of ["List of Groups", "List of Ledgers", "List of Stock Items", "List of Godowns", "List of Cost Centres", "List of Units", "DayBook"]) {
        const query = new URLSearchParams({ companyGuid, from, to, kind });
        const result = await request("/export?" + query);
        if (sequence.current !== current) return;
        if (result.protocol !== 1 || result.company?.guid !== companyGuid || typeof result.xml !== "string") throw new Error("Source company identity mismatch. Export discarded.");
        // Parse each complete envelope first; combine only known Tally messages.
        previewLocalTally(result.xml);
        const matches = result.xml.match(/<TALLYMESSAGE\b[^>]*>[\s\S]*?<\/TALLYMESSAGE>/gi);
        if (!matches) throw new Error(`${kind}: no TALLYMESSAGE records returned. This Tally export contract needs verification; use exported XML.`);
        bodies.push(...matches);
      }
      const parsed = previewLocalTally(`<ENVELOPE><BODY><DATA>${bodies.join("")}</DATA></BODY></ENVELOPE>`);
      const company = companies.find((c) => c.guid === companyGuid);
      if (!company) throw new Error("Selected company is unavailable.");
      parsed.parsed.sourceCompanies = [company];
      setReport(parsed); setFilename(company.name + " · " + company.guid); setExportedAt(new Date().toISOString());
    } catch (e) { if (sequence.current === current) setError(e instanceof Error ? e.message : "Export failed."); }
    finally { if (sequence.current === current) setBusy(false); }
  };
  const selectFile = async (file: File) => {
    reset(); const current = sequence.current; setBusy(true);
    try { const xml = await readLocalTallyFile(file); if (sequence.current !== current) return; setReport(previewLocalTally(xml)); setFilename(file.name); }
    catch (e) { if (sequence.current === current) setError(e instanceof Error ? e.message : "Cannot read this XML file."); }
    finally { if (sequence.current === current) setBusy(false); }
  };
  return <div className="space-y-6">
    <TallyArchiveUploader />
    <Tabs value={source} onValueChange={(value) => { reset(); setSource(value); }}>
      <TabsList><TabsTrigger value="xml"><FileUp className="mr-2 h-4 w-4" />Exported XML</TabsTrigger><TabsTrigger value="bridge"><Cable className="mr-2 h-4 w-4" />Live local bridge</TabsTrigger></TabsList>
      <TabsContent value="xml" className="space-y-3 pt-4">
        <input ref={input} type="file" accept=".xml,text/xml,application/xml" className="hidden" aria-label="Tally exported XML" onChange={(e) => { const file = e.target.files?.[0]; if (file) void selectFile(file); e.target.value = ""; }} />
        <Button onClick={() => input.current?.click()} disabled={busy}><FileUp className="mr-2 h-4 w-4" />Select Tally XML</Button>
        <p className="text-sm text-muted-foreground">Maximum 20 MB. Native Tally company files are not supported. Your original file is unchanged.</p>
      </TabsContent>
      <TabsContent value="bridge" className="space-y-5 pt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="tally-pairing">Local pairing key</Label><Input id="tally-pairing" type="password" autoComplete="off" value={key} onChange={(e) => { setKey(e.target.value); setConnectedAt(null); setCompanies([]); setCompanyGuid(""); }} /></div>
          <div className="space-y-2"><Label>Connection</Label><p className="text-sm">{connectedAt ? "Connected · " + new Date(connectedAt).toLocaleString() : "Not connected"}</p><Button variant="outline" disabled={busy} onClick={testConnection}><RefreshCw className="mr-2 h-4 w-4" />Test Connection</Button></div>
          <div className="space-y-2"><Label>Tally company</Label><Select value={companyGuid} onValueChange={(v) => { reset(); setCompanyGuid(v); }} disabled={busy || !connectedAt}><SelectTrigger><SelectValue placeholder="Select source company" /></SelectTrigger><SelectContent>{companies.map((c) => <SelectItem key={c.guid} value={c.guid}>{c.name} · {c.guid}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="tally-from">From</Label><Input id="tally-from" type="date" value={from} onChange={(e) => { reset(); setFrom(e.target.value); }} /></div><div className="space-y-2"><Label htmlFor="tally-to">To</Label><Input id="tally-to" type="date" value={to} onChange={(e) => { reset(); setTo(e.target.value); }} /></div></div>
        </div>
        <Button disabled={busy || !companyGuid || !connectedAt} onClick={exportLive}><Cable className="mr-2 h-4 w-4" />{busy ? "Reading Tally…" : "Read & Preview"}</Button>
        <dl className="text-sm"><dt className="text-muted-foreground">Last successful read (this session)</dt><dd>{exportedAt ? new Date(exportedAt).toLocaleString() : "None"}</dd><dt className="mt-2 text-muted-foreground">Last committed sync</dt><dd>Not available — canonical Tally commit is not installed.</dd></dl>
        <details className="border-t pt-4 text-sm"><summary className="cursor-pointer font-medium">Local bridge setup</summary><ol className="mt-3 list-decimal space-y-2 pl-5"><li>On the Tally PC, enable TallyPrime’s HTTP server at 127.0.0.1:9000 and load the source company.</li><li>Install Node.js 20+ and install the existing tally-bridge utility’s dependencies.</li><li>Set TALLY_ALLOWED_ORIGIN to this ERP’s exact HTTPS address and TALLY_PAIRING_KEY to a strong random value of at least 32 characters.</li><li>Run npm run serve in the tally-bridge folder. Enter the same pairing key above; it is not saved.</li><li>Allow local-network access if the browser asks. If company GUIDs are unavailable or same-name companies cannot be distinguished, use verified exported XML instead.</li></ol></details>
      </TabsContent>
    </Tabs>
    {error && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Read blocked</AlertTitle><AlertDescription className="break-words">{error}</AlertDescription></Alert>}
    {report && <section className="space-y-5 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-xl font-semibold">Source preview</h2><p className="break-all text-sm text-muted-foreground">{filename}</p></div><Button variant="ghost" onClick={reset}><X className="mr-2 h-4 w-4" />Cancel</Button></div>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">{[["Vouchers", report.parsed.vouchers.length], ["Masters", report.masterCount], ["Bill references", report.parsed.bills.length], ["Cancelled vouchers", report.cancelled], ["From", report.dateFrom ?? "—"], ["To", report.dateTo ?? "—"], ["Stock quantity (mixed units)", report.stockQuantity], ["Signed stock amount", report.stockValue]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words text-lg font-semibold">{value}</dd></div>)}</dl>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Voucher type</th><th className="p-3">Source count</th><th className="p-3">Posted debit</th><th className="p-3">Posted credit</th><th className="p-3">Imported</th></tr></thead><tbody>{Object.entries(report.byType).map(([type, total]) => <tr key={type} className="border-b"><td className="p-3">{type}</td><td className="p-3">{total.count}</td><td className="p-3">{total.debit.toFixed(2)}</td><td className="p-3">{total.credit.toFixed(2)}</td><td className="p-3">0</td></tr>)}</tbody></table></div>
      <Button variant="outline" onClick={() => setValidated(true)}><CheckCircle2 className="mr-2 h-4 w-4" />Validate source</Button>
      {validated && <div className="space-y-3"><p className="font-medium">{report.errors.length} errors · {report.warnings.length} warnings</p>{report.errors.length > 0 && <ul className="max-h-72 list-disc overflow-auto pl-5 text-sm text-destructive">{report.errors.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul>}{report.warnings.length > 0 && <ul className="max-h-72 list-disc overflow-auto pl-5 text-sm text-muted-foreground">{report.warnings.map((e, i) => <li key={i} className="break-words">{e}</li>)}</ul>}</div>}
      <Alert><ShieldAlert className="h-4 w-4" /><AlertTitle>Live accounting import blocked</AlertTitle><AlertDescription>No transactional Tally commit function is installed. This preview has not saved, matched, posted or reconciled any ERP records. Source GUID mapping, changed-voucher policy, verified recovery and accountant-approved controls are required before committing.</AlertDescription></Alert>
      <div className="flex flex-wrap gap-3"><Button disabled>Import into live accounts</Button><Button variant="outline" asChild><Link to="/tally-import">Existing staging & reconciliation</Link></Button></div>
    </section>}
  </div>;
}