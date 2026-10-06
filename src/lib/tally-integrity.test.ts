import { describe, expect, it } from "vitest";
import { parseTallyMasters } from "./tally-import";
import { inspectTallyAccounting } from "./tally-integrity";

const opts = { rawGroups: [], finishedGroups: [] };
const xml = (vouchers: string) => `<ENVELOPE><BODY><DATA><TALLYMESSAGE>${vouchers}</TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
const line = (name: string, positive: string, amount: number) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${name}</LEDGERNAME><ISDEEMEDPOSITIVE>${positive}</ISDEEMEDPOSITIVE><AMOUNT>${amount}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
const voucher = (guid: string, credit: number) => `<VOUCHER VCHTYPE="Journal"><DATE>20261001</DATE><GUID>${guid}</GUID><VOUCHERNUMBER>1</VOUCHERNUMBER>${line("Cash", "Yes", -100)}${line("Revenue", "No", credit)}</VOUCHER>`;

describe("Tally accounting preflight", () => {
  it("keeps every source voucher leg and reconciles debit and credit", () => {
    const result = inspectTallyAccounting(parseTallyMasters(xml(voucher("id-1", 100)), opts));
    expect(result).toEqual({ voucherCount: 1, debit: 100, credit: 100, errors: [] });
  });
  it("reports duplicate IDs, missing stable IDs and unbalanced entries without changing source", () => {
    const noId = voucher("", 100).replace("<GUID></GUID>", "");
    const parsed = parseTallyMasters(xml(voucher("same", 95) + voucher("same", 100) + noId), opts);
    const issues = inspectTallyAccounting(parsed).errors.join(" ");
    expect(issues).toMatch(/duplicate source identifier/);
    expect(issues).toMatch(/unbalanced/);
    expect(issues).toMatch(/stable Tally GUID\/REMOTEID missing/);
  });
});