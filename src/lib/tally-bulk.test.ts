import { describe, expect, it } from "vitest";
import { normalizeTallyImportXml, prepareTallyMessage, sourceCompleteness, newBulkSummary, tallyMessages } from "./tally-bulk";
async function* chunks(...parts: string[]) { yield* parts; }
const voucher = `<TALLYMESSAGE><VOUCHER><GUID>v1</GUID><ALTERID>9</ALTERID><DATE>20261001</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><UDF:NOTE>x&#4;y</UDF:NOTE><ALLLEDGERENTRIES.LIST><LEDGERNAME>Debtor</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-10</AMOUNT><BILLALLOCATIONS.LIST><NAME>B1</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>-10</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>10</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></TALLYMESSAGE>`;
describe("Tally bulk staging", () => {
  it("documents deterministic import-only control and UDF normalization", () => {
    const a = normalizeTallyImportXml(voucher), b = normalizeTallyImportXml(voucher);
    expect(a).toEqual(b); expect(a.xml).toContain("[TALLY_CONTROL_U+0004]");
    expect(a.xml).toContain('xmlns:UDF="TallyUDF"'); expect(a.changes).toHaveLength(2);
  });
  it("retains original XML, UDF payload, identity, totals and bill allocations", () => {
    const [row] = prepareTallyMessage(voucher);
    expect(row.rawXml).toBe(voucher); expect(row.payload["UDF:NOTE"]).toBe("x[TALLY_CONTROL_U+0004]y");
    expect(row).toMatchObject({ sourceId: "v1", alterId: "9", debit: 10, credit: 10, billAllocations: 1, errors: [] });
  });
  it("rejects a settings screen and truncated messages", async () => {
    await expect(async () => { for await (const p of tallyMessages(chunks("<ENVELOPE><BODY></BODY></ENVELOPE>"))) void p; }).rejects.toThrow(/settings/);
    await expect(async () => { for await (const p of tallyMessages(chunks("<ENVELOPE><BODY><DATA><TALLYMESSAGE>"))) void p; }).rejects.toThrow(/Truncated/);
  });
  it("extracts messages across arbitrary chunk boundaries", async () => {
    const out: string[] = [];
    for await (const p of tallyMessages(chunks("<ENVELOPE><BODY><DATA>" + voucher.slice(0, 8), voucher.slice(8, 50), voucher.slice(50), "</DATA></BODY></ENVELOPE>"))) if (p.message) out.push(p.message);
    expect(out).toEqual([voucher]);
  });
  it("does not treat masters-only or unidentified bundles as complete", () => {
    expect(sourceCompleteness(newBulkSummary("ESTIMATE")).join(" ")).toMatch(/GROUP.*GUID.*voucher/);
  });
  it("preserves deleted lifecycle and excludes it from financial totals", () => {
    const [row] = prepareTallyMessage(voucher.replace("<VOUCHER>", '<VOUCHER ACTION="Delete">'));
    expect(row.lifecycle).toBe("deleted"); expect(row.debit).toBe(0); expect(row.credit).toBe(0);
  });
  it("rejects entities and unrecognized namespace repairs", () => {
    expect(() => normalizeTallyImportXml("<!DOCTYPE a>" + voucher)).toThrow(/forbidden/);
    expect(() => normalizeTallyImportXml(voucher.replaceAll("UDF:", "OTHER:"))).toThrow(/Undeclared/);
  });
});