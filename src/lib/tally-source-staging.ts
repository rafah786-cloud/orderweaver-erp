import { TALLY_SOURCES } from "./tally-bulk";

export type TallySource = (typeof TALLY_SOURCES)[number];
export type StagingLine = {
  line: string; company: string; segment?: string; segment_sha256?: string; message_no?: number;
  idempotency_key: string; record_type: string; source_id?: string | null; alter_id?: string | null; master_id?: string | null;
  lifecycle_state?: string; duplicate?: boolean; rejects?: string[]; normalization?: unknown[];
  original_message_xml: string; normalized_message_xml?: string; payload?: unknown;
};

/** Estimate books are always isolated; nothing maps to management shells or ERP companies. */
export const isolationClassFor = (company: TallySource) =>
  company === "ESTIMATE" || company === "ABZ - EST" ? "estimate_isolated" : "official_candidate";

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parses one prepared JSONL evidence chunk; rejects the whole chunk on any mismatch. */
export function parseStagingChunk(text: string, company: TallySource): StagingLine[] {
  const lines = text.split("\n").filter((l) => l.length);
  if (!lines.length || lines.length > 250) throw new Error("Chunk must contain 1–250 rows.");
  const seen = new Set<string>();
  return lines.map((line, i) => {
    let row: any;
    try { row = JSON.parse(line); } catch { throw new Error(`Chunk row ${i + 1} is not valid JSON.`); }
    if (row?.company !== company) throw new Error(`Chunk row ${i + 1} belongs to a different source company.`);
    if (typeof row.original_message_xml !== "string" || typeof row.record_type !== "string") throw new Error(`Chunk row ${i + 1} lacks preserved source XML.`);
    // Rejected messages have no identity: key them by their verbatim XML position.
    const key = typeof row.idempotency_key === "string" && row.idempotency_key
      ? row.idempotency_key : `${company}|REJECTED|${row.segment ?? "?"}|${row.message_no ?? i}`;
    const dedupe = key + "\u0000" + line;
    if (seen.has(dedupe)) throw new Error(`Chunk row ${i + 1} repeats an earlier row.`);
    seen.add(dedupe);
    return { ...row, idempotency_key: key, line };
  });
}
