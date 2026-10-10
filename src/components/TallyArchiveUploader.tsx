import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, FileUp, Loader2, RefreshCw, Trash2, ShieldCheck, AlertTriangle, FileCheck2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "tally-archives";
const MAX_BYTES = 500 * 1024 * 1024;
type ArchiveItem = {
  id: string; original_filename: string; object_path: string; byte_size: number;
  sha256_hex: string; archive_format: "rar4" | "rar5"; processing_status: string;
  processing_message: string | null; created_at: string;
};
// The schema migration lands before generated Supabase types are refreshed in the app.
const db = supabase as any;

function formatSize(bytes = 0) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-160) || "tally-backup.rar";
}
function detectRarFormat(bytes: Uint8Array): "rar4" | "rar5" | null {
  const rar4 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
  const rar5 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];
  if (rar5.every((byte, i) => bytes[i] === byte)) return "rar5";
  if (rar4.every((byte, i) => bytes[i] === byte)) return "rar4";
  return null;
}
async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function TallyArchiveUploader() {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setError("Sign in again before managing Tally backup files.");
      return;
    }
    const { data, error: listError } = await db.from("tally_archive_uploads")
      .select("id,original_filename,object_path,byte_size,sha256_hex,archive_format,processing_status,processing_message,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (listError) {
      setError("Archive registry is not ready. Apply both Tally archive storage and registry migrations before testing this feature.");
      return;
    }
    setItems((data ?? []) as ArchiveItem[]);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const upload = async (file?: File) => {
    if (!file) return;
    setError(null); setMessage(null);
    if (!/\.rar$/i.test(file.name)) {
      setError("Choose a .RAR archive. XML exports should be loaded in the Exported XML tab below.");
      return;
    }
    if (!file.size || file.size > MAX_BYTES) {
      setError("The archive must be non-empty and no larger than 500 MB. The active Supabase plan may enforce a lower limit.");
      return;
    }
    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const archiveFormat = detectRarFormat(header);
      if (!archiveFormat) throw new Error("This file does not have a valid RAR4/RAR5 signature. No file was uploaded.");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Your login session is unavailable. Sign in again.");
      const digest = await sha256(file);
      const objectPath = `${auth.user.id}/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}-${safeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, file, {
        contentType: "application/vnd.rar", cacheControl: "0", upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message.includes("Bucket not found")
        ? "Private archive storage is not configured. Apply the storage migration first."
        : uploadError.message);
      uploadedPath = objectPath;
      const { error: registryError } = await db.from("tally_archive_uploads").insert({
        user_id: auth.user.id, original_filename: file.name.slice(0, 255), object_path: objectPath,
        byte_size: file.size, sha256_hex: digest, archive_format: archiveFormat,
        processing_status: "uploaded",
        processing_message: "Stored unchanged. Native Tally restore/extraction has not run.",
      });
      if (registryError) throw new Error("The archive uploaded but its audit record could not be saved. The upload will be rolled back. " + registryError.message);
      uploadedPath = null;
      setMessage(`Stored ${file.name} privately (${formatSize(file.size)}). SHA-256: ${digest}. Original archive unchanged.`);
      await refresh();
    } catch (e) {
      if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath]).catch(() => ({ error: null }));
      setError(e instanceof Error ? e.message : "Archive upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (item: ArchiveItem) => {
    if (!window.confirm(`Delete the stored archive “${item.original_filename}” and its audit record? This cannot be undone.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in again before deleting a backup.");
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([item.object_path]);
      if (removeError) throw removeError;
      const { error: rowError } = await db.from("tally_archive_uploads").delete().eq("id", item.id).eq("user_id", auth.user.id);
      if (rowError) throw new Error("Archive file was deleted, but the audit row could not be removed: " + rowError.message);
      setMessage(`Deleted ${item.original_filename} from private archive storage.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the archive.");
    } finally { setBusy(false); }
  };

  return <section className="space-y-4 rounded-xl border p-4 md:p-6">
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-muted p-2"><Archive className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold">Tally backup archive (.RAR)</h2>
        <p className="text-sm text-muted-foreground">Upload the original Tally backup into private ERP storage. Each upload gets a SHA-256 integrity fingerprint and an audit record. Maximum 500 MB, subject to project limits.</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </div>
    <input ref={inputRef} type="file" accept=".rar,application/vnd.rar,application/x-rar-compressed" className="hidden" aria-label="Select Tally RAR backup" onChange={(event) => { void upload(event.target.files?.[0]); }} />
    <div role="button" tabIndex={0}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !busy) inputRef.current?.click(); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files?.[0]); }}
      className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-center transition-colors ${dragging ? "border-primary bg-muted" : "border-border"} ${busy ? "pointer-events-none opacity-60" : ""}`}>
      {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <FileUp className="h-7 w-7 text-muted-foreground" />}
      <span className="font-medium">{busy ? "Validating and storing archive…" : "Drop your .RAR file here or tap to browse"}</span>
      <span className="text-xs text-muted-foreground">RAR4/RAR5 signature check, SHA-256 fingerprint, private upload and registry entry. No archive extraction in the browser.</span>
    </div>
    {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Archive action blocked</AlertTitle><AlertDescription className="break-words">{error}</AlertDescription></Alert>}
    {message && <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Archive storage updated</AlertTitle><AlertDescription className="break-words">{message}</AlertDescription></Alert>}
    <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Processing status: upload only</AlertTitle><AlertDescription>The original archive is safely stored, but not yet extracted or imported. Native Tally data requires restoration to an isolated temporary Tally data location and export through TallyPrime before accounting records can be validated and staged. Live Tally and ERP accounts are not changed by upload.</AlertDescription></Alert>
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2"><h3 className="font-medium">Stored archives</h3><span className="text-xs text-muted-foreground">{items.length} shown · newest first</span></div>
      {items.length === 0 ? <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">No stored archives found for your account.</p> :
        <ul className="divide-y rounded-lg border">{items.map((item) => <li key={item.id} className="flex items-center gap-3 p-3">
          <Archive className="h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1">
            <p className="break-all text-sm font-medium">{item.original_filename}</p>
            <p className="text-xs text-muted-foreground">{formatSize(item.byte_size)} · {item.archive_format.toUpperCase()} · {new Date(item.created_at).toLocaleString()}</p>
            <p className="break-all font-mono text-[11px] text-muted-foreground">SHA-256: {item.sha256_hex}</p>
            <p className="flex items-center gap-1 text-xs"><FileCheck2 className="h-3 w-3" />{item.processing_status.replaceAll("_", " ")}{item.processing_message ? ` — ${item.processing_message}` : ""}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label={`Delete ${item.original_filename}`} disabled={busy} onClick={() => void remove(item)}><Trash2 className="h-4 w-4" /></Button>
        </li>)}</ul>}
    </div>
  </section>;
}
