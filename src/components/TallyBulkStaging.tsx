import { useRef, useState } from "react";
import { Download, FolderUp, FileUp, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buildTallyStagingBundles, buildTallyXmlBundle, type BulkBundleResult } from "@/lib/tally-bulk-bundle";
import { archiveTallyStaging } from "@/lib/tally-bulk-archive";

export function TallyBulkStaging() {
  const input = useRef<HTMLInputElement>(null);
  const xmlInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkBundleResult | null>(null);
  const [archive, setArchive] = useState<Blob | null>(null);
  const choose = async (files: File[], directXml = false) => {
    setBusy(true); setError(null); setResult(null); setArchive(null); setStatus("Checking manifests and file hashes…");
    try {
      const prepared = directXml ? await buildTallyXmlBundle(files[0], setStatus) : await buildTallyStagingBundles(files, setStatus);
      setResult(prepared);
      // Avoid duplicating all original/derivative data in memory for large sources.
      if (files.reduce((total, file) => total + file.size, 0) <= 32 * 1024 * 1024) setArchive(await archiveTallyStaging(prepared, files));
      setStatus("Local evidence prepared. Database rows were not transferred. Keep the original XML alongside the downloaded evidence.");
    }
    catch (e) { setError(e instanceof Error ? e.message : "Bundle staging failed."); setStatus(""); }
    finally { setBusy(false); }
  };
  const download = (file: BulkBundleResult["files"][number]) => {
    const url = URL.createObjectURL(file.blob); const a = document.createElement("a");
    a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="space-y-4 border-b pb-6">
    <div><h2 className="text-xl font-semibold">Tally source preparation</h2><p className="text-sm text-muted-foreground">Local evidence only · XML up to 256 MB · ZIP archives must be extracted first</p></div>
    <input ref={xmlInput} type="file" accept=".xml,.zip" className="hidden" aria-label="Tally XML export" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void choose(files, true); e.target.value = ""; }} />
    <input ref={input} type="file" multiple className="hidden" aria-label="TallyBridge snapshot folder" {...{ webkitdirectory: "" }} onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void choose(files); e.target.value = ""; }} />
    <Button onClick={() => input.current?.click()} disabled={busy}><FolderUp className="mr-2 h-4 w-4" />{busy ? "Preparing…" : "Select snapshot folder"}</Button>
    <Button variant="outline" onClick={() => xmlInput.current?.click()} disabled={busy}><FileUp className="mr-2 h-4 w-4" />Select XML export</Button>
    {archive && <Button variant="outline" onClick={() => download({ company: "all", name: "Tally-four-company-staging.zip", blob: archive })}><Download className="mr-2 h-4 w-4" />Download all originals & staging</Button>}
    {status && <p className="text-sm" role="status">{status}</p>}
    {error && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Bundle rejected</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {result && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b">{["Company", "Rows", "Vouchers", "Debit", "Credit", "Missing IDs", "Duplicates", "Rejects", "Blockers", "Files"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{result.summaries.map((s) => <tr key={s.company} className="border-b align-top"><td className="p-2 font-medium">{s.company}</td><td className="p-2">{s.rows}</td><td className="p-2">{s.vouchers}</td><td className="p-2">{s.debit.toFixed(2)}</td><td className="p-2">{s.credit.toFixed(2)}</td><td className="p-2">{s.missingIds}</td><td className="p-2">{s.duplicates}</td><td className="p-2">{s.rejects}</td><td className="p-2"><ul className="list-disc pl-4">{s.blockers.map((b) => <li key={b}>{b}</li>)}</ul></td><td className="p-2">{result.files.filter((f) => f.company === s.company).map((f) => <Button key={f.name} variant="ghost" size="sm" onClick={() => download(f)}><Download className="mr-1 h-3 w-3" />{f.name.endsWith(".jsonl") ? f.name.match(/rows-(\d+)/)?.[1] : "Evidence"}</Button>)}</td></tr>)}</tbody></table></div>}
    <Alert><ShieldAlert className="h-4 w-4" /><AlertTitle>Cloud staging remains blocked</AlertTitle><AlertDescription>Local staging files only; no cloud transfer, posting, approval or cutover. Approved chunked cross-company staging and a dedicated ESTIMATE destination are required.</AlertDescription></Alert>
  </section>;
}