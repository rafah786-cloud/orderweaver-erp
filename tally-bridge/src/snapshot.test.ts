import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTallyXml, validateCollectionResponse, validateVoucherRegisterDates } from "./snapshot.js";
import { auditVoucherXml } from "./voucher-audit.js";

const envelope = (body: string, status = 1) =>
  `<ENVELOPE><HEADER><STATUS>${status}</STATUS></HEADER><BODY><DATA>${body}</DATA></BODY></ENVELOPE>`;

test("sanitizes XML 1.0-invalid control characters", () => {
  assert.equal(sanitizeTallyXml("a\u0001b\u000Bc"), "abc");
});

test("counts named ledger objects but not CMPINFO scalar totals", () => {
  const xml = envelope("<CMPINFO><LEDGER>0</LEDGER></CMPINFO><LEDGER NAME=\"Cash\" />");
  assert.equal(validateCollectionResponse("List of Ledgers", xml).recordCount, 1);
});

test("counts real group master records", () => {
  const xml = envelope('<GROUP NAME="Primary"><PARENT /> </GROUP><GROUP NAME="Secondary" />');
  assert.equal(validateCollectionResponse("List of Groups", xml).recordCount, 2);
});

test("rejects an unsuccessful Tally response", () => {
  assert.throws(
    () => validateCollectionResponse("List of Ledgers", envelope('<LEDGER NAME="Cash" />', 0)),
    /status was 0/,
  );
});

test("rejects a response containing a different master collection", () => {
  assert.throws(
    () => validateCollectionResponse("List of Ledgers", envelope('<GROUP NAME="Primary" />')),
    /no named <LEDGER> master records/,
  );
});

test("allows a genuinely empty optional master collection", () => {
  assert.equal(validateCollectionResponse("List of Godowns", envelope("")).recordCount, 0);
});

test("rejects non-envelope responses", () => {
  assert.throws(
    () => validateCollectionResponse("List of Groups", "<html>Access denied</html>"),
    /not an export envelope/,
  );
});

test("accepts Voucher Register vouchers inside the requested date window", () => {
  const xml = envelope('<VOUCHER><DATE>20220401</DATE><VOUCHERNUMBER>A1</VOUCHERNUMBER></VOUCHER><VOUCHER><DATE>20220430</DATE><VOUCHERNUMBER>A2</VOUCHERNUMBER></VOUCHER>');
  assert.deepEqual(validateVoucherRegisterDates(xml, "2022-04-01", "2022-04-30"), { voucherCount: 2 });
});

test("rejects Tally Voucher Register vouchers outside the requested date window", () => {
  const xml = envelope('<VOUCHER><DATE>20261012</DATE><VOUCHERNUMBER>ABT-26-27/723</VOUCHERNUMBER></VOUCHER>');
  assert.throws(
    () => validateVoucherRegisterDates(xml, "2022-04-01", "2022-04-30"),
    /out-of-range voucher ABT-26-27\/723 dated 20261012; refusing to save/,
  );
});

test("rejects vouchers without valid dates", () => {
  assert.throws(
    () => validateVoucherRegisterDates(envelope("<VOUCHER><VOUCHERNUMBER>A1</VOUCHERNUMBER></VOUCHER>"), "2022-04-01", "2022-04-30"),
    /missing\/invalid DATE; refusing to save/,
  );
});


test("ignores empty Tally list containers instead of counting them as entries", () => {
  const xml = envelope(`
    <VOUCHER>
      <DATE>20220403</DATE><GUID>accounting-only-guid</GUID><VOUCHERNUMBER>141</VOUCHERNUMBER><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
      <ALLINVENTORYENTRIES.LIST></ALLINVENTORYENTRIES.LIST>
      <LEDGERENTRIES.LIST><LEDGERNAME>Party</LEDGERNAME><AMOUNT>100</AMOUNT></LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST><LEDGERNAME>Expense</LEDGERNAME><AMOUNT>-100</AMOUNT></LEDGERENTRIES.LIST>
    </VOUCHER>`);
  const [row] = auditVoucherXml(xml);
  assert.equal(row.inventoryEntries, 0);
  assert.equal(row.inventoryAccountingAllocations, 0);
  assert.equal(row.status, "candidate-balanced");
  assert.equal(row.notes.some(note => note.includes("Inventory exists")), false);
});

test("audits a sales voucher using ledger postings plus nested inventory accounting allocations", () => {
  const xml = envelope(`
    <VOUCHER>
      <DATE>20220402</DATE><GUID>sales-guid</GUID><VOUCHERNUMBER>SALE-1</VOUCHERNUMBER><VOUCHERTYPENAME>B2C SALES</VOUCHERTYPENAME>
      <LEDGERENTRIES.LIST><LEDGERNAME>Bank</LEDGERNAME><AMOUNT>-4250.00</AMOUNT></LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST><LEDGERNAME>CGST</LEDGERNAME><AMOUNT>101.20</AMOUNT></LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST><LEDGERNAME>SGST</LEDGERNAME><AMOUNT>101.20</AMOUNT></LEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST><LEDGERNAME>Round Off</LEDGERNAME><AMOUNT>-0.40</AMOUNT></LEDGERENTRIES.LIST>
      <ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Mattress</STOCKITEMNAME><AMOUNT>4048.00</AMOUNT><ACTUALQTY>5 NOS</ACTUALQTY>
        <ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>4048.00</AMOUNT></ACCOUNTINGALLOCATIONS.LIST>
      </ALLINVENTORYENTRIES.LIST>
    </VOUCHER>`);
  const [row] = auditVoucherXml(xml);
  assert.equal(row.ledgerFamily, "LEDGERENTRIES.LIST");
  assert.equal(row.ledgerEntries, 4);
  assert.equal(row.inventoryEntries, 1);
  assert.equal(row.inventoryAccountingAllocations, 1);
  assert.equal(row.ledgerNet, -4048);
  assert.equal(row.allocationNet, 4048);
  assert.ok(row.combinedCandidateNet === 0, `expected zero candidate net, got ${row.combinedCandidateNet}`);
  assert.equal(row.status, "candidate-balanced");
});

test("audits receipt postings and does not require inventory allocations", () => {
  const xml = envelope(`
    <VOUCHER><DATE>20220402</DATE><GUID>receipt-guid</GUID><VOUCHERNUMBER>131</VOUCHERNUMBER><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>Customer</LEDGERNAME><AMOUNT>5917.00</AMOUNT></ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>-5917.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    </VOUCHER>`);
  const [row] = auditVoucherXml(xml);
  assert.equal(row.ledgerFamily, "ALLLEDGERENTRIES.LIST");
  assert.equal(row.ledgerNet, 0);
  assert.equal(row.combinedCandidateNet, 0);
  assert.equal(row.status, "candidate-balanced");
});

test("does not double-count alternate ledger-entry families", () => {
  const xml = envelope(`
    <VOUCHER><DATE>20220402</DATE><GUID>alias-guid</GUID><VOUCHERNUMBER>ALIAS-1</VOUCHERNUMBER>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>-10</AMOUNT></ALLLEDGERENTRIES.LIST>
      <LEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>-10</AMOUNT></LEDGERENTRIES.LIST>
    </VOUCHER>`);
  const [row] = auditVoucherXml(xml);
  assert.equal(row.ledgerFamily, "ALLLEDGERENTRIES.LIST");
  assert.equal(row.ledgerEntries, 1);
  assert.equal(row.ledgerNet, -10);
});

test("marks missing ledger amounts as incomplete instead of balanced", () => {
  const xml = envelope(`
    <VOUCHER><DATE>20220402</DATE><GUID>incomplete-guid</GUID><VOUCHERNUMBER>INCOMPLETE-1</VOUCHERNUMBER>
      <LEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME></LEDGERENTRIES.LIST>
    </VOUCHER>`);
  const [row] = auditVoucherXml(xml);
  assert.equal(row.status, "incomplete");
  assert.equal(row.combinedCandidateNet, null);
});


test("does not count nested bill allocation amounts as separate ledger postings", () => {
  const xml = envelope(`
    <VOUCHER><DATE>20220402</DATE><GUID>bill-guid</GUID><VOUCHERNUMBER>BILL-1</VOUCHERNUMBER>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>Debtor</LEDGERNAME><AMOUNT>-100.00</AMOUNT>
        <BILLALLOCATIONS.LIST><NAME>INV-1</NAME><AMOUNT>-100.00</AMOUNT></BILLALLOCATIONS.LIST>
      </ALLLEDGERENTRIES.LIST>
      <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sales</LEDGERNAME><AMOUNT>100.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    </VOUCHER>`);
  const [row] = auditVoucherXml(xml);
  assert.equal(row.ledgerNet, 0);
  assert.equal(row.status, "candidate-balanced");
});
