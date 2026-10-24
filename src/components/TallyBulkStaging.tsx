import { useEffect, useRef, useState } from "react";
import { scanTallyFolder, type FolderScan } from "@/lib/tally-folder-scan";
import { useServerFn } from "@tanstack/react-start";
import { CloudUpload, Download, FolderUp, FileUp, ShieldAlert } from "lucide-react";
import { stageTallySourceChunk } from "@/lib/tally-source-staging.functions";
import { sha256Hex } from "@/lib/tally-source-staging";
import type { TALLY_SOURCES } from "@/lib/tally-bulk";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buildTallyStagingBundles, buildTallyXmlBundle, type BulkBundleResult } from "@/lib/tally-bulk-bundle";
import { archiveTallyStaging } from "@/lib/tally-bulk-archive";

async function hasUnsupportedJsonExManifest(files: File[]): Promise<boolean> {
  const manifests = files.filter((file) => file.name.toLowerCase() === "manifest.json");
  for (const manifestFile of manifests) {
    try {
      const manifest = JSON.parse(await manifestFile.text()) as { format?: unknown; stagingCompatible?: unknown };
      if ((typeof manifest.format === "string" && manifest.format.toUpperCase() !== "XML") || manifest.stagingCompatible === false) return true;
    } catch {
      // Leave malformed manifests to the existing bundle validation path.
    }
  }
  return false;
}

export function TallyBulkStaging() {
  const input = useRef<HTMLInputElement>(null);
  const xmlInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkBundleResult | null>(null);
  const [archive, setArchive] = useState<Blob | null>(null);
  const [detected, setDetected] = useState<FolderScan | null>(null);
  // Set directory attributes on the DOM node so every browser receives them verbatim (no accept filter on folder mode).
  useEffect(() => {
    const el = input.current; if (!el) return;
    el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); el.setAttribute("mozdirectory", "");
  }, []);
  const choose = async (files: File[], directXml = false) => {
    const first = files[0];
    if (!first) return;
    setBusy(true); setError(null); setResult(null); setArchive(null); setStatus("Checking manifests and file hashes…");
    if (!directXml && await hasUnsupportedJsonExManifest(files)) {
      setError("This folder contains a native Tally JSONEx snapshot. It has been preserved as read-only source evidence, but the ERP staging parser currently accepts XML only. Nothing was staged; use an XML snapshot for the existing staging workflow.");
      setStatus(""); setBusy(false); return;
    }
    if (!directXml) {
      const scan = scanTallyFolder(files); setDetected(scan);
      if (scan.missing.length || scan.unsupported.length) {
        setError(`Folder not ready: ${scan.missing.length ? `missing ${scan.missing.join(", ")}` : ""}${scan.missing.length && scan.unsupported.length ? "; " : ""}${scan.unsupported.length ? `unrecognised folders ${scan.unsupported.join(", ")}` : ""}. Nothing was staged.`);
        setStatus(""); setBusy(false); return;
      }
    } else setDetected(null);
    try {
      await new Promise((r) => setTimeout(r, 0)); // let the status paint before work starts
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
    <input ref={input} type="file" multiple className="hidden" aria-label="TallyBridge snapshot folder" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void choose(files); e.target.value = ""; }} />
    <Button onClick={() => input.current?.click()} disabled={busy}><FolderUp className="mr-2 h-4 w-4" />{busy ? "Preparing…" : "Select snapshot folder"}</Button>
    <Button variant="outline" onClick={() => xmlInput.current?.click()} disabled={busy}><FileUp className="mr-2 h-4 w-4" />Select XML export</Button>
    {archive && <Button variant="outline" onClick={() => download({ company: "all", name: "Tally-four-company-staging.zip", blob: archive })}><Download className="mr-2 h-4 w-4" />Download all originals & staging</Button>}
    {result && <Button variant="secondary" onClick={() => void stageToCloud()} disabled={busy}><CloudUpload className="mr-2 h-4 w-4" />Stage to cloud (staging only, resumable)</Button>}
    <p className="text-xs text-muted-foreground">Folder mode: choose the parent folder holding ABOOD_TRADINGS, ABRAZ_SLEEPING_SOLUTIONS, ABZ_EST and ESTIMATE, then press Upload. Your system dialog hides files in folder mode — that is expected.</p>
    {detected && <div className="text-sm"><p className="font-medium">Detected company folders</p><ul className="list-disc pl-5">{detected.companies.map((c) => <li key={c.folder}>{c.company} — {c.folder}: {c.files} files ({c.xml} XML, {c.manifests} manifest)</li>)}{detected.missing.map((m) => <li key={m} className="text-destructive">{m}: missing</li>)}{detected.unsupported.map((u) => <li key={u} className="text-destructive">{u}: not a recognised source company</li>)}</ul></div>}
    {status && <p className="text-sm" role="status">{status}</p>}
    {result?.summaries.some((s) => s.blockers.length > 0) && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Incomplete or quarantined source — not import-ready</AlertTitle><AlertDescription>Evidence is retained for review only. The company report lists missing masters, source identity gaps and rejected records.</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><ShieldAlert className="h-4 w-4" /><AlertTitle>Bundle rejected</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {result && <div className="space-y-4">{result.summaries.map((s) => {
      const files = result.files.filter((f) => f.company === s.company);
      const evidence = files.find((f) => !f.name.endsWith(".jsonl"));
      const chunks = files.filter((f) => f.name.endsWith(".jsonl"));
      const noAmounts = s.vouchers > 0 && s.amountsUnavailable > 0;
      const stats: Array<[string, string | number]> = [["Rows", s.rows], ["Vouchers", s.vouchers], ["Debit", noAmounts && !s.debit ? "n/a" : s.debit.toFixed(2)], ["Credit", noAmounts && !s.credit ? "n/a" : s.credit.toFixed(2)], ["Missing IDs", s.missingIds], ["Duplicates", s.duplicates], ["Rows with errors", s.rejects], ["Unparseable messages", s.rejectedMessages], ["Files read", s.files]];
      return <div key={s.company} className="rounded-md border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{s.company}</h3>
          <div className="flex gap-2">{evidence && <Button variant="outline" size="sm" onClick={() => download(evidence)}><Download className="mr-1 h-3 w-3" />Evidence report</Button>}<span className="text-xs text-muted-foreground self-center">{chunks.length} row chunks</span></div></div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9">{stats.map(([k, v]) => <div key={k} className="rounded bg-muted p-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-mono text-sm">{v}</dd></div>)}</dl>
        <div className="text-sm"><p className="font-medium">Records found by type</p><p className="text-muted-foreground">{Object.entries(s.byType).sort().map(([k, v]) => `${k}: ${v}`).join(" · ") || "none"}</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Manifest file read</th><th className="p-2">Messages</th><th className="p-2">Record types</th></tr></thead><tbody>{s.segments.map((g) => <tr key={g.name} className="border-b align-top"><td className="p-2 break-all">{g.name}</td><td className="p-2">{g.messages}</td><td className="p-2">{Object.entries(g.byType).map(([k, v]) => `${k}: ${v}`).join(" · ") || "none"}</td></tr>)}</tbody></table></div>
        {Object.keys(s.rejectReasons).length > 0 && <div className="text-sm"><p className="font-medium">Error reasons (rows affected)</p><ul className="list-disc pl-5 break-words">{Object.entries(s.rejectReasons).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([r, n]) => <li key={r}>{n.toLocaleString()} × {r}</li>)}</ul></div>}
        {s.unlistedInventory.length > 0 && <div className="text-sm"><p className="font-medium text-destructive">Not listed in manifest.json — not verified, not staged (read-only look)</p><ul className="list-disc pl-5 break-all">{s.unlistedInventory.map((u) => <li key={u.name}>{u.name} ({(u.bytes / 1048576).toFixed(1)} MB): {u.error ? u.error : `${u.messages} messages · ${Object.entries(u.byType).map(([k, v]) => `${k}: ${v}`).join(" · ") || "no records"}${u.companyGuidPresent ? " · company GUID present" : ""}`}</li>)}</ul></div>}
        {s.blockers.length > 0 && <div className="text-sm"><p className="font-medium text-destructive">Blockers</p><ul className="list-disc pl-5">{s.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
      </div>;
    })}</div>}
    <Alert><ShieldAlert className="h-4 w-4" /><AlertTitle>Staging only — no posting</AlertTitle><AlertDescription>Cloud staging stores verbatim source evidence in a separate admin-only area, never linked to company books. ESTIMATE and ABZ - EST stay isolated. No posting, approval or cutover.</AlertDescription></Alert>
  </section>;
}