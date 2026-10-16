import { describe, expect, it } from "vitest";
import { isolationClassFor, parseStagingChunk, sha256Hex } from "./tally-source-staging";

const row = (o: Record<string, unknown> = {}) => JSON.stringify({ company: "ESTIMATE", record_type: "LEDGER", idempotency_key: "ESTIMATE|LEDGER:g1|5", original_message_xml: "<TALLYMESSAGE/>", ...o });

describe("tally source staging boundary", () => {
  it("isolates estimate sources", () => {
    expect(isolationClassFor("ESTIMATE")).toBe("estimate_isolated");
    expect(isolationClassFor("ABZ - EST")).toBe("estimate_isolated");
    expect(isolationClassFor("ABOOD TRADINGS")).toBe("official_candidate");
  });
  it("rejects cross-company rows and repeats", () => {
    expect(() => parseStagingChunk(row({ company: "ABOOD TRADINGS" }), "ESTIMATE")).toThrow(/different source company/);
    expect(() => parseStagingChunk(row() + "\n" + row(), "ESTIMATE")).toThrow(/repeats/);
    expect(() => parseStagingChunk(row({ original_message_xml: undefined }), "ESTIMATE")).toThrow(/preserved/);
  });
  it("keys rejected messages by position and hashes deterministically", async () => {
    const [r] = parseStagingChunk(row({ idempotency_key: undefined, record_type: "REJECTED_MESSAGE", segment: "a.xml", message_no: 3 }), "ESTIMATE");
    expect(r.idempotency_key).toBe("ESTIMATE|REJECTED|a.xml|3");
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
