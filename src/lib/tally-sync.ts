import { createHash } from "node:crypto";

export type TallySyncRow = {
  alter_id: string;
  source_key: string;
  source_id?: string | null;
  payload_hash: string;
  payload: Record<string, unknown>;
  lifecycle_state?: "posted" | "cancelled" | "optional" | "deleted";
};

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function normalizeAlterId(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) throw new Error("Tally Alter ID must be a non-negative integer");
  const id = BigInt(trimmed);
  if (id <= 0n) throw new Error("Tally Alter ID must be greater than zero");
  return id;
}

export function hashSyncPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

export function hashSyncBatch(recordType: string, rows: TallySyncRow[]): string {
  const canonicalRows = [...rows]
    .sort((a, b) => {
      const ai = normalizeAlterId(a.alter_id);
      const bi = normalizeAlterId(b.alter_id);
      return ai < bi ? -1 : ai > bi ? 1 : a.source_key.localeCompare(b.source_key);
    })
    .map((row) => ({
      alter_id: row.alter_id.trim(),
      source_key: row.source_key.trim(),
      source_id: row.source_id ?? null,
      payload_hash: row.payload_hash,
      lifecycle_state: row.lifecycle_state ?? "posted",
      payload: row.payload,
    }));

  return createHash("sha256")
    .update(stableJson({ record_type: recordType, rows: canonicalRows }))
    .digest("hex");
}

export function validateSyncBatch(
  previousAlterId: string,
  recordType: string,
  rows: TallySyncRow[],
) {
  if (!recordType.trim()) throw new Error("record_type is required");
  if (!/^\d+$/.test(previousAlterId.trim())) {
    throw new Error("Previous Tally Alter ID must be a non-negative integer");
  }

  const previous = BigInt(previousAlterId.trim());
  if (rows.length === 0) throw new Error("A sync batch must contain at least one row");

  const seenAlterIds = new Set<string>();
  const normalized = rows.map((row) => {
    const alterId = normalizeAlterId(row.alter_id);
    const alterKey = alterId.toString();
    if (seenAlterIds.has(alterKey)) throw new Error("Duplicate Alter ID in sync batch: " + alterKey);
    seenAlterIds.add(alterKey);

    if (!row.source_key.trim()) throw new Error("Every sync row requires source_key");
    if (!row.payload_hash.trim()) throw new Error("Every sync row requires payload_hash");
    if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
      throw new Error("Every sync row requires an object payload");
    }

    if (alterId <= previous) {
      throw new Error("Sync row Alter ID " + alterKey + " is not newer than the stored watermark");
    }
    if (row.payload_hash !== hashSyncPayload(row.payload)) {
      throw new Error("Payload hash mismatch for Alter ID " + alterKey);
    }

    return {
      ...row,
      alter_id: alterKey,
      source_key: row.source_key.trim(),
      lifecycle_state: row.lifecycle_state ?? "posted",
    };
  });

  normalized.sort((a, b) => {
    const ai = BigInt(a.alter_id);
    const bi = BigInt(b.alter_id);
    return ai < bi ? -1 : ai > bi ? 1 : a.source_key.localeCompare(b.source_key);
  });

  return {
    rows: normalized,
    previousAlterId: previous.toString(),
    newAlterId: normalized[normalized.length - 1].alter_id,
    payloadHash: hashSyncBatch(recordType, normalized),
  };
}
