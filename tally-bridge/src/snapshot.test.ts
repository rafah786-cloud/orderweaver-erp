import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTallyXml, validateCollectionResponse } from "./snapshot.js";

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
