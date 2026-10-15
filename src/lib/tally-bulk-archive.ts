import { Zip, ZipPassThrough } from "fflate";
import type { BulkBundleResult } from "./tally-bulk-bundle";

/** No compression worker, provider or scheduler. ZIP preserves original bytes verbatim. */
export async function archiveTallyStaging(result: BulkBundleResult, originals: File[]): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, bytes) => {
    if (error) failure = error;
    else chunks.push(new Uint8Array(bytes));
  });
  const add = async (name: string, blob: Blob) => {
    if (name.split("/").some((part) => part === "..") || name.startsWith("/")) throw new Error("Unsafe archive path.");
    const entry = new ZipPassThrough(name); zip.add(entry);
    const reader = blob.stream().getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      entry.push(value, false);
    }
    entry.push(new Uint8Array(), true);
  };
  for (const file of originals) await add("originals/" + (file.webkitRelativePath || file.name), file);
  for (const file of result.files) await add("staging/" + file.company.replace(/[^A-Z0-9]+/g, "-") + "/" + file.name, file.blob);
  await add("REPORT.json", new Blob([JSON.stringify({ status: "LOCAL_PREPARATION_ONLY", cloudTransferred: false, posted: false, approved: false, companies: result.summaries }, null, 2)]));
  zip.end();
  if (failure) throw failure;
  return new Blob(chunks, { type: "application/zip" });
}