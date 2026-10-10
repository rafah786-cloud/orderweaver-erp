import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, FileUp, Loader2, RefreshCw, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "tally-archives";
const MAX_BYTES = 500 * 1024 * 1024;
type ArchiveItem = { name: string; id?: string; created_at?: string; metadata?: { size?: number } };

function formatSize(bytes = 0) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-160) || "tally-backup.rar";
}
function isRarHeader(bytes: Uint8Array) {
  const rar4 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
  const rar5 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];
  return [rar4, rar5].some((signature) => signature.every((byte, i) => bytes[i] === byte));
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
    const { data, error: listError } = await supabase.storage.from(BUCKET).list(auth.user.id, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (listError) {
      setError(listError.message.includes("Bucket not found")
        ? "Private archive storage is not configured yet. Apply the Tally archive storage migration first."
        : "Could not list stored backups. Check that the archive storage migration has been applied and try again.");
      return;
    }
    setItems((data ?? []).filter((item) => item.name && !item.name.startsWith(".")).map((item) => ({
      name: item.name, id: item.id ?? undefined, created_at: item.created_at ?? undefined,
      metadata: item.metadata as ArchiveItem["metadata"],
    })));
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
      setError("The archive must be non-empty and no larger than 500 MB. The storage service may enforce a lower limit depending on your plan.");
      return;
    }
    setBusy(true);
    try {
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (!isRarHeader(header)) throw new Error("This file does not have a valid RAR4/RAR5 signature. No file was uploaded.");
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Your login session is unavailable. Sign in again.");
      const objectName = `${auth.user.id}/${new Date().toISOString().replace(/[:.]/g, "-")}-${safeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectName, file, {
        contentType: "application/vnd.rar",
        cacheControl: "0",
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message.includes("Bucket not found")
        ? "Private archive storage is not configured yet. Apply the Tally archive storage migration first."
        : uploadError.message);
      setMessage(`Stored ${file.name} privately (${formatSize(file.size)}). The original archive is unchanged.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (name: string) => {
    if (!window.confirm(`Delete the stored archive “${name}”? This cannot be undone.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in again before deleting a backup.");
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([`${auth.user.id}/${name}`]);
      if (removeError) throw removeError;
      setMessage(`Deleted ${name} from private archive storage.`);
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
        <p className="text-sm text-muted-foreground">Upload and securely store the original Tally backup in private ERP storage. Maximum upload size: 500 MB, subject to your storage plan.</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </div>
    <input ref={inputRef} type="file" accept=".rar,application/vnd.rar,application/x-rar-compressed" className="hidden" aria-label="Select Tally RAR backup" onChange={(event) => { void upload(event.target.files?.[0]); }} />
    <div
      role="button" tabIndex={0}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !busy) inputRef.current?.click(); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files?.[0]); }}
      className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-center transition-colors ${dragging ? "border-primary bg-muted" : "border-border"} ${busy ? "pointer-events-none opacity-60" : ""}`}
    >
      {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <FileUp className="h-7 w-7 text-muted-foreground" />}
      <span className="font-medium">{busy ? "Processing archive…" : "Drop your .RAR file here or tap to browse"}</span>
      <span className="text-xs text-muted-foreground">RAR4 and RAR5 signatures are checked before upload. No files are extracted in the browser.</span>
    </div>
    {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Archive action blocked</AlertTitle><AlertDescription className="break-words">{error}</AlertDescription></Alert>}
    {message && <Alert><ShieldCheck className="h-4 w-4" /><AlertTitle>Archive storage updated</AlertTitle><AlertDescription className="break-words">{message}</AlertDescription></Alert>}
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Storage is not the same as migration</AlertTitle>
      <AlertDescription>The archive is retained unchanged and is not yet extracted or imported. Native Tally backup data must be restored into an isolated temporary Tally data location and exported through TallyPrime before accounting records can be validated and staged. This feature does not overwrite live Tally or post ERP accounts.</AlertDescription>
    </Alert>
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2"><h3 className="font-medium">Stored archives</h3><span className="text-xs text-muted-foreground">{items.length} shown · newest first</span></div>
      {items.length === 0 ? <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">No stored archives found for your account.</p> : <ul className="divide-y rounded-lg border">{items.map((item) => <li key={item.name} className="flex items-center gap-3 p-3"><Archive className="h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{formatSize(item.metadata?.size)}{item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ""}</p></div><Button variant="ghost" size="icon" aria-label={`Delete ${item.name}`} disabled={busy} onClick={() => void remove(item.name)}><Trash2 className="h-4 w-4" /></Button></li>)}</ul>}
    </div>
  </section>;
}
