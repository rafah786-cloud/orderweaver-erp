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
  it("does not multiply totals when a message contains multiple vouchers", () => {
    const pair = voucher.replace("</TALLYMESSAGE>", voucher.slice("<TALLYMESSAGE>".length).replace("<GUID>v1</GUID>", "<GUID>v2</GUID>"));
    const rows = prepareTallyMessage(pair);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.debit, r.credit, r.billAllocations])).toEqual([[10, 10, 1], [10, 10, 1]]);
  });
  it("preserves inherited UDF namespaces and valid whitespace controls", () => {
    const normalized = normalizeTallyImportXml(voucher.replace("x&#4;y", "x&#9;&#10;&#13;y"), 'xmlns:UDF="CustomSourceNamespace"');
    expect(normalized.xml).toContain('xmlns:UDF="CustomSourceNamespace"');
    expect(normalized.xml).toContain("&#9;&#10;&#13;");
  });
  it("ignores boundary-looking tags in CDATA and comments across byte-sized chunks", async () => {
    const message = '<TALLYMESSAGE><GROUP><GUID>g1</GUID><NOTE><![CDATA[</TALLYMESSAGE>]]></NOTE><!-- <TALLYMESSAGE> --></GROUP></TALLYMESSAGE>';
    const source = "<ENVELOPE><BODY><DATA>" + message + "</DATA></BODY></ENVELOPE>";
    const out: string[] = [];
    for await (const p of tallyMessages(chunks(...source.split("")))) if (p.message) out.push(p.message);
    expect(out).toEqual([message]);
  });
  it("rejects malformed envelope structure even when its tail looks valid", async () => {
    await expect(async () => { for await (const p of tallyMessages(chunks("<ENVELOPE><BODY><IMPORTDATA><DATA>" + voucher + "</DATA></BODY></ENVELOPE>"))) void p; }).rejects.toThrow(/Malformed source envelope/);
  });
  it("uses exact minor-unit controls and quarantines unsupported amounts instead of silently treating them as zero", () => {
    const [decimal] = prepareTallyMessage(voucher.replaceAll("10</AMOUNT>", "0.29</AMOUNT>"));
    expect(decimal).toMatchObject({ debit: 0.29, credit: 0.29, errors: [] });
    const [invalid] = prepareTallyMessage(voucher.replace("-10</AMOUNT>", "not-money</AMOUNT>"));
    expect(invalid.errors.join(" ")).toContain("monetary control totals unavailable");
    expect(invalid.debit).toBe(0); expect(invalid.credit).toBe(0);
    const [imbalance] = prepareTallyMessage(voucher.replace("-10</AMOUNT>", "-10.01</AMOUNT>"));
    expect(imbalance.errors.join(" ")).toContain("Exact minor-unit");
  });
});