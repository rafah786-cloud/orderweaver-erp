import { describe, expect, it } from "vitest";
import { hashSyncBatch, normalizeAlterId, validateSyncBatch } from "./tally-sync";

describe("tally sync control plane", () => {
  it("normalizes numeric Alter IDs without losing precision", () => {
    expect(normalizeAlterId("00042")).toBe(42n);
  });

  it("rejects a batch row at or below the stored watermark", () => {
    expect(() =>
      validateSyncBatch("42", "voucher", [
        {
          alter_id: "42",
          source_key: "v-42",
          payload_hash: "1234567890abcdef",
          payload: { GUID: "g-42" },
        },
      ]),
    ).toThrow(/not newer/);
  });

  it("sorts rows and produces a deterministic batch hash", () => {
    const a = [
      {
        alter_id: "44",
        source_key: "v-44",
        payload_hash: "aaaaaaaaaaaaaaaa",
        payload: { B: 2, A: 1 },
      },
      {
        alter_id: "43",
        source_key: "v-43",
        payload_hash: "bbbbbbbbbbbbbbbb",
        payload: { A: 1, B: 2 },
      },
    ];
    const b = [...a].reverse();

    const va = validateSyncBatch("42", "voucher", a);
    const vb = validateSyncBatch("42", "voucher", b);

    expect(va.newAlterId).toBe("44");
    expect(va.rows.map((r) => r.alter_id)).toEqual(["43", "44"]);
    expect(va.payloadHash).toBe(vb.payloadHash);
    expect(hashSyncBatch("voucher", va.rows)).toBe(va.payloadHash);
  });

  it("rejects duplicate Alter IDs in one batch", () => {
    expect(() =>
      validateSyncBatch("10", "voucher", [
        {
          alter_id: "11",
          source_key: "a",
          payload_hash: "aaaaaaaaaaaaaaaa",
          payload: {},
        },
        {
          alter_id: "11",
          source_key: "b",
          payload_hash: "bbbbbbbbbbbbbbbb",
          payload: {},
        },
      ]),
    ).toThrow(/Duplicate Alter ID/);
  });
});
