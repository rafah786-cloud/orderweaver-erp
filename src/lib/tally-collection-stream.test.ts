import { describe, it, expect } from "vitest";
import { tallyMessages, MAX_MESSAGE_BYTES } from "./tally-bulk";
async function* chunks(s: string, n = 7) { for (let i = 0; i < s.length; i += n) yield s.slice(i, i + n); }
const collect = async (s: string) => { const out = []; for await (const p of tallyMessages(chunks(s, s.length > 1e6 ? 65536 : 7))) out.push(p); return out; };
describe("collection-format streaming", () => {
  it("splits COLLECTION exports into bounded per-record messages", async () => {
    const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION></HEADER><BODY><DATA><COLLECTION><VOUCHER REMOTEID="a"><VOUCHER.LIST><X/></VOUCHER.LIST><NARRATION>1</NARRATION></VOUCHER><VOUCHER REMOTEID="b"><NARRATION>2</NARRATION></VOUCHER></COLLECTION></DATA></BODY></ENVELOPE>`;
    const msgs = (await collect(xml)).filter((p) => p.message).map((p) => p.message);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toBe(`<TALLYMESSAGE><VOUCHER REMOTEID="a"><VOUCHER.LIST><X/></VOUCHER.LIST><NARRATION>1</NARRATION></VOUCHER></TALLYMESSAGE>`);
  });
  it("still handles TALLYMESSAGE envelopes", async () => {
    const xml = `<ENVELOPE><BODY><DATA><TALLYMESSAGE><LEDGER NAME="x"/></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
    expect((await collect(xml)).filter((p) => p.message)).toHaveLength(1);
  });
  it("rejects a recordless header that grows past the bound with a precise reason", async () => {
    const xml = `<ENVELOPE><BODY><DATA><X>${"a".repeat(MAX_MESSAGE_BYTES + 10)}</X></DATA></BODY></ENVELOPE>`;
    await expect(collect(xml.replace(/./g, (c) => c))).rejects.toThrow(/no TALLYMESSAGE or COLLECTION/);
  });
});
