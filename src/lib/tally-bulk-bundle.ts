import { type BulkSummary, NORMALIZATION_VERSION, TALLY_SOURCES, hashText, newBulkSummary, prepareTallyMessage, sourceCompleteness, tallyMessages } from "./tally-bulk";
import { sha256 as streamingSha256 } from "@noble/hashes/sha2.js";

type Segment = { path: string; sha256: string; bytes: number; name?: string };
type Manifest = { company: string; companyGuid?: string; segments: Segment[]; bridgeVersion?: string; schemaVersion?: number };
function readManifest(value: unknown): Manifest {
  if (!value || typeof value !== "object") throw new Error("Invalid TallyBridge manifest object.");
  const m = value as Partial<Manifest>;
  if (typeof m.company !== "string" || (m.companyGuid !== undefined && typeof m.companyGuid !== "string") ||
    (m.bridgeVersion !== undefined && m.bridgeVersion !== "1.0.9") || (m.schemaVersion !== undefined && m.schemaVersion !== 1)) throw new Error("Unsupported TallyBridge manifest version or company identity.");
  if (!Array.isArray(m.segments) || !m.segments.length || m.segments.some((s) => !s || typeof s.path !== "string" || !s.path ||
    typeof s.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(s.sha256) || !Number.isSafeInteger(s.bytes) || s.bytes < 0)) throw new Error("Manifest segments require path, exact bytes and SHA-256 checksum.");
  return m as Manifest;
}
const safePath = (path: string) => {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.split("/").some((p) => p === ".." || p === ".") || normalized.includes("\0")) throw new Error("Unsafe source path.");
  return normalized;
};
export type BulkBundleResult = { summaries: BulkSummary[]; files: Array<{ company: string; name: string; blob: Blob }> };
const relative = (file: File) => file.webkitRelativePath || file.name;
/** Yield to the browser event loop so progress paints and the page stays responsive during long parsing. */
let lastYield = 0;
export async function yieldToUi(force = false) {
  const now = Date.now();
  if (!force && now - lastYield < 40) return;
  await new Promise<void>((resolve) => {
    if (typeof MessageChannel !== "undefined") { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); resolve(); }; ch.port2.postMessage(null); }
    else setTimeout(resolve, 0);
  });
  lastYield = Date.now();
}

/** Streaming SHA-256: a Web Worker in browsers; elsewhere chunked with event-loop yields. Never reads whole files. */
export async function hashTallyFile(file: Blob, onProgress?: (bytes: number) => void): Promise<string> {
  if (typeof window !== "undefined" && typeof Worker !== "undefined") {
    const worker = new Worker(new URL("./tally-hash.worker.ts", import.meta.url), { type: "module" });
    try {
      return await new Promise<string>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<{ hex?: string; error?: string; progress?: number }>) => {
          if (e.data.progress != null) onProgress?.(e.data.progress);
          else if (e.data.hex) resolve(e.data.hex);
          else reject(new Error(e.data.error ?? "Hashing failed."));
        };
        worker.onerror = (e) => reject(new Error(e.message || "Hash worker failed to start."));
        worker.postMessage({ file });
      });
    } finally { worker.terminate(); }
  }
  const hash = streamingSha256.create();
  const reader = file.stream().getReader();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let i = 0; i < value.byteLength; i += 4 * 1024 * 1024) {
        const part = value.subarray(i, i + 4 * 1024 * 1024);
        hash.update(part); bytes += part.byteLength; onProgress?.(bytes); await yieldToUi();
      }
    }
    return Array.from(hash.digest(), (b) => b.toString(16).padStart(2, "0")).join("");
  } finally { reader.releaseLock(); }
}

/** Read-only inventory of a file missing from manifest.json. Results are diagnostic only and never staged or trusted. */
export async function peekUnlisted(file: File, name: string) {
  const out = { name, bytes: file.size, messages: 0, byType: {} as Record<string, number>, companyGuidPresent: false, error: undefined as string | undefined };
  if (file.size > 256 * 1024 * 1024) { out.error = "Larger than 256 MB; not inspected."; return out; }
  try {
    for await (const part of tallyMessages(decoded(file))) {
      if (!part.message) continue;
      out.messages++;
      const type = part.message.match(/^<TALLYMESSAGE\b[^>]*>\s*<([A-Za-z_][\w.:-]*)/)?.[1] ?? "UNKNOWN";
      out.byType[type] = (out.byType[type] ?? 0) + 1;
      if (type === "COMPANY" && /<GUID>[^<]+<\/GUID>/.test(part.message)) out.companyGuidPresent = true;
      await yieldToUi();
    }
  } catch (error) { out.error = (error as Error).message; }
  return out;
}

/** Direct XML is local evidence only: never infer a destination or company GUID. */
export async function buildTallyXmlBundle(file: File, progress: (label: string) => void): Promise<BulkBundleResult> {
  if (!file.name.toLowerCase().endsWith(".xml")) throw new Error("ZIP archives cannot be ingested directly. Extract the archive, then select its XML export or snapshot folder.");
  if (file.size > 256 * 1024 * 1024) throw new Error("XML exceeds the 256 MB local preparation limit. Re-export smaller periods.");
  progress("Hashing original XML…");
  const hash = await hashTallyFile(file, (b) => progress(`Hashing original XML ${Math.round((b / Math.max(file.size, 1)) * 100)}%`));
  let company: string | undefined;
  for await (const part of tallyMessages(decoded(file))) {
    if (part.header) {
      company = part.header.match(/<SVCURRENTCOMPANY(?:\s[^>]*)?>([^<]+)<\/SVCURRENTCOMPANY>/)?.[1]?.trim().toUpperCase();
      break;
    }
  }
  if (!company || !TALLY_SOURCES.some((source) => source === company)) throw new Error("XML must explicitly identify one of the four source companies through SVCURRENTCOMPANY. No company is inferred from its filename.");
  const manifest = new File([JSON.stringify({ company, segments: [{ path: file.name, bytes: file.size, sha256: hash }] })], "manifest.json");
  const result = await buildTallyStagingBundles([file, manifest], progress, false);
  const evidence = result.files.find((entry) => entry.name.endsWith("source-evidence.json"));
  if (evidence) result.files.push({ company, name: "generated-local-manifest.json", blob: manifest });
  return result;
}

async function* decoded(file: File): AsyncGenerator<string> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const encoding = head[0] === 0xff && head[1] === 0xfe ? "utf-16le" : head[0] === 0xfe && head[1] === 0xff ? "utf-16be" : "utf-8";
  const decoder = new TextDecoder(encoding, { fatal: true });
  const reader = file.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally { await reader.cancel(); reader.releaseLock(); }
}

export async function buildTallyStagingBundles(files: File[], progress: (label: string) => void, requireFourCompanies = true): Promise<BulkBundleResult> {
  if (files.reduce((sum, file) => sum + file.size, 0) > 512 * 1024 * 1024) throw new Error("Snapshot folder exceeds the 512 MB browser preparation limit. Use smaller source export periods; no partial bundle was staged.");
  const manifests = files.filter((f) => relative(f).toLowerCase().endsWith("manifest.json"));
  if (manifests.length !== (requireFourCompanies ? TALLY_SOURCES.length : 1)) throw new Error("Select the TallyBridge folder containing exactly the four company manifest.json files.");
  if (new Set(files.map((f) => safePath(relative(f)))).size !== files.length) throw new Error("Duplicate source file paths are not allowed.");
  const result: BulkBundleResult = { summaries: [], files: [] };
  const seenCompanies = new Set<string>();
  for (const manifestFile of [...manifests].sort((a, b) => relative(a).localeCompare(relative(b)))) {
    if (manifestFile.size > 1024 * 1024) throw new Error("Manifest exceeds the 1 MB limit.");
    const manifest = readManifest(JSON.parse(await manifestFile.text()));
    const company = manifest.company?.trim().toUpperCase() ?? "";
    if (!TALLY_SOURCES.some((source) => source === company) || seenCompanies.has(company)) throw new Error(`Unexpected or duplicate source company: ${manifest.company ?? "missing"}`);
    seenCompanies.add(company);
    if (manifest.bridgeVersion && manifest.bridgeVersion !== "1.0.9") throw new Error(`${company}: TallyBridge ${manifest.bridgeVersion} is unsupported; 1.0.9 is required.`);
    const dir = safePath(relative(manifestFile)).slice(0, -"manifest.json".length);
    const summary = newBulkSummary(company);
    summary.companyGuid = manifest.companyGuid?.trim() || null;
    const keys = new Set<string>(), alters = new Set<string>();
    const identityErrors: string[] = [];
    const evidence: Array<{ name: string; bytes: number; sha256: string }> = [];
    const safe = company.replace(/[^A-Z0-9]+/g, "-");
    let rows: string[] = [], size = 0, chunk = 0;
    let debitMinor = 0n, creditMinor = 0n;
    const flush = () => {
      if (!rows.length) return;
      result.files.push({ company, name: `${safe}-rows-${String(++chunk).padStart(5, "0")}.jsonl`, blob: new Blob([rows.join("\n") + "\n"], { type: "application/x-ndjson" }) });
      rows = []; size = 0;
    };
    const append = (row: unknown) => {
      const line = JSON.stringify(row); const bytes = new TextEncoder().encode(line).length;
      if (bytes > 64 * 1024 * 1024) throw new Error("Preserved evidence row exceeds the 64 MB limit; re-export a smaller record.");
      if (size + bytes > 4 * 1024 * 1024 || rows.length >= 250) flush();
      rows.push(line); size += bytes;
    };
    const seenSegments = new Set<string>();
    if (!Array.isArray(manifest.segments) || !manifest.segments.length) throw new Error(`${company}: manifest has no source segments.`);
    for (const segment of manifest.segments ?? []) {
      const path = safePath(segment.path);
      const absolute = /^[A-Za-z]:\//.test(path) || path.startsWith("/");
      // Absolute exporter paths are references only; resolve their unique basename inside this company folder.
      const name = absolute ? path.split("/").pop() : path;
      const matches = files.filter((f) => safePath(relative(f)) === dir + name);
      const file = matches.length === 1 ? matches[0] : undefined;
      if (!name || !file || !segment.sha256 || seenSegments.has(name)) throw new Error(`${company}: manifest segment missing or repeated.`);
      seenSegments.add(name);
      if (file.size > 256 * 1024 * 1024) throw new Error(`${company}: split ${name} into exports below 256 MB.`);
      progress(`${company}: checking ${name} fingerprint…`); await yieldToUi(true);
      const fileHash = await hashTallyFile(file, (b) => progress(`${company}: checking ${name} fingerprint ${Math.round((b / Math.max(file.size, 1)) * 100)}%`));
      if (fileHash !== segment.sha256.toLowerCase() || (segment.bytes != null && segment.bytes !== file.size)) throw new Error(`${company}: ${name} differs from its manifest hash or size.`);
      evidence.push({ name, bytes: file.size, sha256: fileHash }); summary.files++;
      let messageNo = 0, inheritedNamespaces = "";
      const segmentTypes: Record<string, number> = {};
      try {
      for await (const part of tallyMessages(decoded(file))) {
        if (part.header) {
          if (!/<ENVELOPE\b[^>]*>/.test(part.header) || !/<BODY\b[^>]*>/.test(part.header) || !/(?:<DATA\b[^>]*>|<REQUESTDATA\b[^>]*>|<COLLECTION\b[^>]*>)\s*$/.test(part.header)) throw new Error(`${company}: unsupported source envelope header.`);
          const selected = part.header.match(/<SVCURRENTCOMPANY(?:\s[^>]*)?>([^<]+)<\/SVCURRENTCOMPANY>/)?.[1]?.trim().toUpperCase();
          if (selected && selected !== company) throw new Error(`${company}: selected source company in ${name} does not match manifest.`);
          inheritedNamespaces = [...part.header.matchAll(/xmlns:[\w.-]+\s*=\s*(?:"[^"]*"|'[^']*')/g)].map((m) => m[0]).join(" ");
        }
        if (!part.message) continue;
        messageNo++;
        if (messageNo % 50 === 0) progress(`${company}: ${name} message ${messageNo} (processing…)`);
        await yieldToUi();
        try {
          for (const row of prepareTallyMessage(part.message, inheritedNamespaces)) {
            const identity = row.sourceId ? `${row.recordType}:${row.sourceId}` : `${row.recordType}:missing:${await hashText(row.rawXml)}`;
            const alterKey = row.alterId && /^\d+$/.test(row.alterId) ? `${row.recordType}:${BigInt(row.alterId)}` : null;
            let duplicate = keys.has(identity) || Boolean(alterKey && alters.has(alterKey));
            if (duplicate) row.errors.push("Duplicate source GUID/REMOTEID or ALTERID within record type.");
            if (row.masterId) {
              const masterKey = `MASTERID:${row.recordType}:${row.masterId}`;
              if (keys.has(masterKey)) { duplicate = true; row.errors.push("Duplicate MASTERID within record type."); }
              keys.add(masterKey);
            }
            keys.add(identity); if (alterKey) alters.add(alterKey);
            summary.rows++; summary.byType[row.recordType] = (summary.byType[row.recordType] ?? 0) + 1;
            segmentTypes[row.recordType] = (segmentTypes[row.recordType] ?? 0) + 1;
            summary.lifecycle[row.lifecycle] = (summary.lifecycle[row.lifecycle] ?? 0) + 1;
            if (row.recordType === "VOUCHER") summary.vouchers++;
            if (row.recordType === "COMPANY" && row.sourceId) {
              if (summary.companyGuid && summary.companyGuid !== row.sourceId) identityErrors.push("Source COMPANY GUID differs from manifest.");
              else summary.companyGuid = row.sourceId;
            }
            if (row.recordType === "COMPANY" && typeof row.payload["@_NAME"] === "string" && row.payload["@_NAME"].trim().toUpperCase() !== company) identityErrors.push("Source COMPANY name differs from manifest.");
            debitMinor += BigInt(Math.round(row.debit * 100)); creditMinor += BigInt(Math.round(row.credit * 100));
            if (debitMinor > BigInt(Number.MAX_SAFE_INTEGER) || creditMinor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Company monetary totals exceed safe reporting range.");
            summary.debit = Number(debitMinor) / 100; summary.credit = Number(creditMinor) / 100;
            summary.inventoryLines += row.inventoryLines; summary.billAllocations += row.billAllocations;
            summary.missingIds += row.sourceId ? 0 : 1; summary.duplicates += duplicate ? 1 : 0;
            summary.rejects += row.errors.length || duplicate ? 1 : 0;
            for (const reason of new Set(row.errors)) summary.rejectReasons[reason] = (summary.rejectReasons[reason] ?? 0) + 1;
            if (row.errors.some((e) => e.includes("monetary control totals unavailable"))) summary.amountsUnavailable++;
            summary.normalized += row.normalization.length ? 1 : 0;
            append({ company, segment: name, segment_sha256: fileHash, message_no: messageNo,
              idempotency_key: `${company}|${identity}|${row.alterId ?? "no-alter"}`, record_type: row.recordType, source_id: row.sourceId, alter_id: row.alterId, master_id: row.masterId,
              lifecycle_state: row.lifecycle, normalization_version: NORMALIZATION_VERSION, normalization: row.normalization, duplicate, rejects: row.errors,
              original_message_xml: row.rawXml, normalized_message_xml: row.normalizedXml, payload: row.payload });
          }
        } catch (error) {
          summary.rejectedMessages++;
          const reason = `Unparseable message: ${(error as Error).message}`;
          summary.rejectReasons[reason] = (summary.rejectReasons[reason] ?? 0) + 1;
          append({ company, segment: name, message_no: messageNo, record_type: "REJECTED_MESSAGE", rejects: [(error as Error).message], original_message_xml: part.message });
        }
      }
      } catch (error) { throw new Error(`${company} / ${name} (after message ${messageNo}): ${(error as Error).message}`); }
      summary.segments.push({ name, messages: messageNo, byType: segmentTypes });
      progress(`${company}: ${name} parsed ${messageNo} messages`);
      await yieldToUi(true);
    }
    flush();
    // Files present in the company folder but absent from its manifest are never read; report them so missing masters are traceable.
    summary.unlistedFiles = files.map((f) => safePath(relative(f))).filter((p) => p.startsWith(dir) && p !== dir + "manifest.json" && !seenSegments.has(p.slice(dir.length))).map((p) => p.slice(dir.length)).sort();
    for (const unlisted of summary.unlistedFiles) {
      const f = files.find((x) => safePath(relative(x)) === dir + unlisted)!;
      progress(`${company}: inspecting unlisted ${unlisted} (read-only)…`);
      summary.unlistedInventory.push(await peekUnlisted(f, unlisted));
    }
    summary.blockers = [...sourceCompleteness(summary), ...identityErrors];
    if (summary.unlistedFiles.length) summary.blockers.push(`${summary.unlistedFiles.length} file(s) in this company folder are not listed in manifest.json and were not read: ${summary.unlistedFiles.slice(0, 5).join(", ")}${summary.unlistedFiles.length > 5 ? "…" : ""}`);
    if (!manifest.bridgeVersion) summary.blockers.push("Manifest matches repository schema v1 but does not establish TallyBridge 1.0.9 provenance; actual installed-exporter evidence is required.");
    if (company === "ESTIMATE" || company === "ABZ - EST") summary.blockers.unshift("Estimate source isolated: not eligible for official company staging, approval or cutover.");
    result.summaries.push(summary);
    result.files.push({ company, name: `${safe}-source-evidence.json`, blob: new Blob([JSON.stringify({ company, summary, originals: evidence, manifest }, null, 2)], { type: "application/json" }) });
  }
  return result;
}