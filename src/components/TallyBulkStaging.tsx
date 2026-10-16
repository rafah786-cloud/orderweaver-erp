import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CloudUpload, Download, FolderUp, FileUp, ShieldAlert } from "lucide-react";
import { stageTallySourceChunk } from "@/lib/tally-source-staging.functions";
import { sha256Hex } from "@/lib/tally-source-staging";
import type { TALLY_SOURCES } from "@/lib/tally-bulk";
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
    const first = files[0];
    if (!first) return;
    setBusy(true); setError(null); setResult(null); setArchive(null); setStatus("Checking manifests and file hashes…");
    try {
      const prepared = directXml ? await buildTallyXmlBundle(first, setStatus) : await buildTallyStagingBundles(files, setStatus);
      // Avoid duplicating all original/derivative data in memory for large sources.
      if (files.reduce((total, file) => total + file.size, 0) <= 32 * 1024 * 1024) setArchive(await archiveTallyStaging(prepared, files));
      setResult(prepared);
      setStatus("Local evidence prepared. Database rows were not transferred. Keep the original XML alongside the downloaded evidence.");
    }
    catch (e) { setError(e instanceof Error ? e.message : "Bundle staging failed."); setStatus(""); }
    finally { setBusy(false); }
  };
  const download = (file: BulkBundleResult["files"][number]) => {
    const url = URL.createObjectURL(file.blob); const a = document.createElement("a");
    a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const stageChunk = useServerFn(stageTallySourceChunk);
  // Resumable: every chunk is idempotent by hash, so re-running after a failure skips staged chunks.
  const stageToCloud = async () => {
    if (!result) return;
    setBusy(true); setError(null);
    try {
      const chunks = result.files.filter((f) => f.name.endsWith(".jsonl"));
      let done = 0, skipped = 0, rows = 0;
      for (const file of chunks) {
        const company = file.company as (typeof TALLY_SOURCES)[number];
        const guid = result.summaries.find((s) => s.company === company)?.companyGuid ?? null;
        const chunkText = await file.blob.text();
        const r = await stageChunk({ data: { sourceCompany: company, sourceCompanyGuid: guid, chunkName: file.name, chunkSha256: await sha256Hex(chunkText), chunkText } });
        done++; rows += r.rows; if (r.alreadyStaged) skipped++;
        setStatus(`Staging-only upload: ${done}/${chunks.length} chunks (${skipped} already staged), ${rows} rows sent.`);
      }
      setStatus(`Staging complete: ${done} chunks, ${rows} rows confirmed by the database. Nothing was posted.`);
    } catch (e) { setError((e instanceof Error ? e.message : "Staging failed.") + " Run again to resume."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 border-b pb-6">
    <div><h2 className="text-xl font-semibold">Tally source preparation</h2><p className="text-sm text-muted-foreground">Local evidence only · XML up to 256 MB · ZIP archives must be extracted first</p></div>
    <input ref={xmlInput} type="file" accept=".xml,.zip" className="hidden" aria-label="Tally XML export" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void choose(files, true); e.target.value = ""; }} />
    <input ref={input} type="file" multiple className="hidden" aria-label="TallyBridge snapshot folder" {...{ webkitdirectory: "" }} onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void choose(files); e.target.value = ""; }} />
    <Button onClick={() => input.current?.click()} disabled={busy}><FolderUp className="mr-2 h-4 w-4" />{busy ? "Preparing…" : "Select snapshot folder"}</Button>
    <Button variant="outline" onClick={() => xmlInput.current?.click()} disabled={busy}><FileUp className="mr-2 h-4 w-4" />Select XML export</Button>
    {archive && <Button variant="outline" onClick={() => download({ company: "all", name: "Tally-four-company-staging.zip", blob: archive })}><Download className="mr-2 h-4 w-4" />Download all originals & staging</Button>}
    {result && <Button variant="secondary" onClick={() => void stageToCloud()} disabled={busy}><CloudUpload className="mr-2 h-4 w-4" />Stage to cloud (staging only, resumable)</Button>}
    {status && <p className="text-sm" role="status">{status}</p>}
    {result?.summaries.some((s) => s.blockers.length > 0) && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Incomplete or quarantined source — not import-ready</AlertTitle><AlertDescription>Evidence is retained for review only. The company report lists missing masters, source identity gaps and rejected records.</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Bundle rejected</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {result && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b">{["Company", "Rows", "Vouchers", "Debit", "Credit", "Missing IDs", "Duplicates", "Rejects", "Blockers", "Files"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{result.summaries.map((s) => <tr key={s.company} className="border-b align-top"><td className="p-2 font-medium">{s.company}</td><td className="p-2">{s.rows}</td><td className="p-2">{s.vouchers}</td><td className="p-2">{s.debit.toFixed(2)}</td><td className="p-2">{s.credit.toFixed(2)}</td><td className="p-2">{s.missingIds}</td><td className="p-2">{s.duplicates}</td><td className="p-2">{s.rejects}</td><td className="p-2"><ul className="list-disc pl-4">{s.blockers.map((b) => <li key={b}>{b}</li>)}</ul></td><td className="p-2">{result.files.filter((f) => f.company === s.company).map((f) => <Button key={f.name} variant="ghost" size="sm" onClick={() => download(f)}><Download className="mr-1 h-3 w-3" />{f.name.endsWith(".jsonl") ? f.name.match(/rows-(\d+)/)?.[1] : "Evidence"}</Button>)}</td></tr>)}</tbody></table></div>}
    <Alert><ShieldAlert className="h-4 w-4" /><AlertTitle>Staging only — no posting</AlertTitle><AlertDescription>Cloud staging stores verbatim source evidence in a separate admin-only area, never linked to company books. ESTIMATE and ABZ - EST stay isolated. No posting, approval or cutover.</AlertDescription></Alert>
  </section>;
}