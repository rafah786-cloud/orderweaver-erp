import { type BulkSummary, NORMALIZATION_VERSION, TALLY_SOURCES, hashText, newBulkSummary, prepareTallyMessage, sha256, sourceCompleteness, tallyMessages } from "./tally-bulk";

type Segment = { path?: string; sha256?: string; bytes?: number; name?: string };
export type BulkBundleResult = { summaries: BulkSummary[]; files: Array<{ company: string; name: string; blob: Blob }> };
const relative = (file: File) => file.webkitRelativePath || file.name;

async function* decoded(file: File): AsyncGenerator<string> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const encoding = head[0] === 0xff && head[1] === 0xfe ? "utf-16le" : head[0] === 0xfe && head[1] === 0xff ? "utf-16be" : "utf-8";
  const decoder = new TextDecoder(encoding, { fatal: true });
  const reader = file.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

export async function buildTallyStagingBundles(files: File[], progress: (label: string) => void): Promise<BulkBundleResult> {
  if (files.reduce((sum, file) => sum + file.size, 0) > 512 * 1024 * 1024) throw new Error("Snapshot folder exceeds the 512 MB browser preparation limit. Use smaller source export periods; no partial bundle was staged.");
  const manifests = files.filter((f) => relative(f).toLowerCase().endsWith("manifest.json"));
  if (manifests.length !== TALLY_SOURCES.length) throw new Error("Select the TallyBridge folder containing exactly the four company manifest.json files.");
  const result: BulkBundleResult = { summaries: [], files: [] };
  const seenCompanies = new Set<string>();
  for (const manifestFile of manifests) {
    const manifest = JSON.parse(await manifestFile.text()) as { company?: string; companyGuid?: string; segments?: Segment[]; bridgeVersion?: string };
    const company = manifest.company?.trim().toUpperCase() ?? "";
    if (!TALLY_SOURCES.some((source) => source === company) || seenCompanies.has(company)) throw new Error(`Unexpected or duplicate source company: ${manifest.company ?? "missing"}`);
    seenCompanies.add(company);
    if (manifest.bridgeVersion && manifest.bridgeVersion !== "1.0.9") throw new Error(`${company}: TallyBridge ${manifest.bridgeVersion} is unsupported; 1.0.9 is required.`);
    const dir = relative(manifestFile).slice(0, -"manifest.json".length);
    const summary = newBulkSummary(company);
    summary.companyGuid = manifest.companyGuid?.trim() || null;
    const keys = new Set<string>(), alters = new Set<string>();
    const identityErrors: string[] = [];
    const evidence: Array<{ name: string; bytes: number; sha256: string }> = [];
    const safe = company.replace(/[^A-Z0-9]+/g, "-");
    let rows: string[] = [], size = 0, chunk = 0;
    const flush = () => {
      if (!rows.length) return;
      result.files.push({ company, name: `${safe}-rows-${String(++chunk).padStart(5, "0")}.jsonl`, blob: new Blob([rows.join("\n") + "\n"], { type: "application/x-ndjson" }) });
      rows = []; size = 0;
    };
    const append = (row: unknown) => {
      const line = JSON.stringify(row); const bytes = new TextEncoder().encode(line).length;
      if (size + bytes > 4 * 1024 * 1024 || rows.length >= 250) flush();
      rows.push(line); size += bytes;
    };
    const seenSegments = new Set<string>();
    if (!Array.isArray(manifest.segments) || !manifest.segments.length) throw new Error(`${company}: manifest has no source segments.`);
    for (const segment of manifest.segments ?? []) {
      const name = segment.path?.split(/[\\/]/).pop();
      const file = files.find((f) => relative(f) === dir + name);
      if (!name || !file || !segment.sha256 || seenSegments.has(name)) throw new Error(`${company}: manifest segment missing or repeated.`);
      seenSegments.add(name);
      if (file.size > 256 * 1024 * 1024) throw new Error(`${company}: split ${name} into exports below 256 MB.`);
      const fileHash = await sha256(await file.arrayBuffer());
      if (fileHash !== segment.sha256.toLowerCase() || (segment.bytes != null && segment.bytes !== file.size)) throw new Error(`${company}: ${name} differs from its manifest hash or size.`);
      evidence.push({ name, bytes: file.size, sha256: fileHash }); summary.files++;
      let messageNo = 0;
      for await (const part of tallyMessages(decoded(file))) {
        if (part.header) {
          if (!/<ENVELOPE\b[^>]*>/.test(part.header) || !/<BODY\b[^>]*>/.test(part.header) || !/(?:<DATA\b[^>]*>|<REQUESTDATA\b[^>]*>)\s*$/.test(part.header)) throw new Error(`${company}: unsupported source envelope header.`);
          const selected = part.header.match(/<SVCURRENTCOMPANY(?:\s[^>]*)?>([^<]+)<\/SVCURRENTCOMPANY>/)?.[1]?.trim().toUpperCase();
          if (selected && selected !== company) throw new Error(`${company}: selected source company in ${name} does not match manifest.`);
        }
        if (!part.message) continue;
        messageNo++;
        if (messageNo % 100 === 0) progress(`${company}: ${name} message ${messageNo}`);
        try {
          for (const row of prepareTallyMessage(part.message)) {
            const identity = row.sourceId ? `${row.recordType}:${row.sourceId}` : `${row.recordType}:missing:${await hashText(row.rawXml)}`;
            const alterKey = row.alterId && /^\d+$/.test(row.alterId) ? `${row.recordType}:${BigInt(row.alterId)}` : null;
            let duplicate = keys.has(identity) || Boolean(alterKey && alters.has(alterKey));
            if (row.masterId) {
              const masterKey = `MASTERID:${row.recordType}:${row.masterId}`;
              if (keys.has(masterKey)) { duplicate = true; row.errors.push("Duplicate MASTERID within record type."); }
              keys.add(masterKey);
            }
            keys.add(identity); if (alterKey) alters.add(alterKey);
            summary.rows++; summary.byType[row.recordType] = (summary.byType[row.recordType] ?? 0) + 1;
            summary.lifecycle[row.lifecycle] = (summary.lifecycle[row.lifecycle] ?? 0) + 1;
            if (row.recordType === "VOUCHER") summary.vouchers++;
            if (row.recordType === "COMPANY" && row.sourceId) {
              if (summary.companyGuid && summary.companyGuid !== row.sourceId) identityErrors.push("Source COMPANY GUID differs from manifest.");
              else summary.companyGuid = row.sourceId;
            }
            summary.debit += row.debit; summary.credit += row.credit;
            summary.inventoryLines += row.inventoryLines; summary.billAllocations += row.billAllocations;
            summary.missingIds += row.sourceId ? 0 : 1; summary.duplicates += duplicate ? 1 : 0;
            summary.rejects += row.errors.length || duplicate ? 1 : 0; summary.normalized += row.normalization.length ? 1 : 0;
            append({ company, segment: name, segment_sha256: fileHash, message_no: messageNo,
              idempotency_key: `${company}|${identity}|${row.alterId ?? "no-alter"}`, record_type: row.recordType, source_id: row.sourceId, alter_id: row.alterId, master_id: row.masterId,
              lifecycle_state: row.lifecycle, normalization_version: NORMALIZATION_VERSION, normalization: row.normalization, duplicate, rejects: row.errors,
              original_message_xml: row.rawXml, normalized_message_xml: row.normalizedXml, payload: row.payload });
          }
        } catch (error) {
          summary.rejects++;
          append({ company, segment: name, message_no: messageNo, record_type: "REJECTED_MESSAGE", rejects: [(error as Error).message], original_message_xml: part.message });
        }
      }
    }
    flush();
    summary.blockers = [...sourceCompleteness(summary), ...identityErrors];
    summary.blockers.push("TallyBridge 1.0.9 export contract is not verified from repository version alone; original manifests must be reviewed against the installed exporter.");
    if (company === "ESTIMATE" || company === "ABZ - EST") summary.blockers.unshift("Estimate source isolated: not eligible for official company staging, approval or cutover.");
    result.summaries.push(summary);
    result.files.push({ company, name: `${safe}-source-evidence.json`, blob: new Blob([JSON.stringify({ company, summary, originals: evidence, manifest }, null, 2)], { type: "application/json" }) });
  }
  return result;
}