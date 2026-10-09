import { describe, expect, it } from "vitest";
import { previewLocalTally, validAccountingDate } from "./local-tally";
const wrap = (body: string) => `<ENVELOPE><BODY><DATA><TALLYMESSAGE>${body}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
const inventory = `<VOUCHER VCHTYPE="Sales"><GUID>sales-1</GUID><DATE>20261009</DATE><VOUCHERNUMBER>1</VOUCHERNUMBER><ALLLEDGERENTRIES.LIST><LEDGERNAME>Debtor</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-100</AMOUNT></ALLLEDGERENTRIES.LIST><ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Mattress</STOCKITEMNAME><ACTUALQTY>1 pcs</ACTUALQTY><BILLEDQTY>1 pcs</BILLEDQTY><RATE>100/pcs</RATE><AMOUNT>100</AMOUNT><ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>100</AMOUNT></ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST></VOUCHER>`;
describe("Local Tally read-only preview", () => {
  it("includes inventory accounting allocations in double entry", () => {
    const report = previewLocalTally(wrap(inventory));
    expect(report.errors).toEqual([]);
    expect(report.parsed.vouchers[0].entries).toHaveLength(2);
    expect(report.byType.Sales).toEqual({ count: 1, debit: 100, credit: 100 });
  });
  it("retains cancelled vouchers without requiring live posting legs", () => {
    const report = previewLocalTally(wrap(`<VOUCHER VCHTYPE="Sales"><GUID>cancel</GUID><DATE>20261009</DATE><ISCANCELLED>Yes</ISCANCELLED></VOUCHER>`));
    expect(report.cancelled).toBe(1);
    expect(report.errors).toEqual([]);
  });
  it("retains invalid dates for reporting instead of discarding vouchers", () => {
    expect(previewLocalTally(wrap(inventory.replace("20261009", "20260230"))).errors.join(" ")).toMatch(/invalid.*date/);
    expect(validAccountingDate("2026-02-30")).toBe(false);
  });
  it("rejects entities, malformed XML and control characters", () => {
    expect(() => previewLocalTally('<!DOCTYPE x>' + wrap(inventory))).toThrow(/entities/);
    expect(() => previewLocalTally(wrap(inventory).slice(0, -4))).toThrow(/malformed/);
    expect(() => previewLocalTally(wrap(inventory + "\u0001"))).toThrow(/control/);
  });
  it("preserves distinct company GUIDs and detects duplicate master identities", () => {
    const xml = wrap('<COMPANY NAME="ABRAZ"><GUID>a</GUID></COMPANY><COMPANY NAME="ABRAZ"><GUID>b</GUID></COMPANY><LEDGER NAME="A"><GUID>x</GUID><MASTERID>1</MASTERID></LEDGER><LEDGER NAME="B"><GUID>x</GUID><MASTERID>1</MASTERID></LEDGER>');
    const report = previewLocalTally(xml);
    expect(report.parsed.sourceCompanies).toEqual([{ name: "ABRAZ", guid: "a" }, { name: "ABRAZ", guid: "b" }]);
    expect(report.errors.join(" ")).toMatch(/Duplicate ledger source_guid/);
    expect(report.errors.join(" ")).toMatch(/Duplicate ledger master_id/);
  });
  it("preserves unit GUID and master ID", () => {
    expect(previewLocalTally(wrap('<UNIT NAME="pcs"><GUID>u</GUID><MASTERID>4</MASTERID><ALTERID>5</ALTERID></UNIT>')).parsed.units?.[0]).toMatchObject({ name: "pcs", source_guid: "u", master_id: "4" });
  });
});