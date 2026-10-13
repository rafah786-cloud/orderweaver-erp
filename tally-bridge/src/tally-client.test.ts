import assert from "node:assert/strict";
import test from "node:test";
import { collectionRequest, dataRequest } from "./tally-client.js";

test("collection requests pin the selected Tally company, XML format and compact Tally dates", () => {
  const xml = collectionRequest("List of Ledgers", {
    company: "A & B <Test>",
    fromDate: "2026-04-01",
    toDate: "2026-10-06",
  });
  assert.match(xml, /<SVCURRENTCOMPANY TYPE="String">A &amp; B &lt;Test&gt;<\/SVCURRENTCOMPANY>/);
  assert.match(xml, /<SVEXPORTFORMAT>\$\$SysName:XML<\/SVEXPORTFORMAT>/);
  assert.match(xml, /<SVFROMDATE TYPE="Date">20260401<\/SVFROMDATE>/);
  assert.match(xml, /<SVTODATE TYPE="Date">20261006<\/SVTODATE>/);
});

test("data requests are company-qualified and use compact date bounds", () => {
  const xml = dataRequest("DayBook", {
    company: "Abood Tradings",
    fromDate: "2026-01-01",
    toDate: "2026-01-31",
  });
  assert.match(xml, /<TYPE>Data<\/TYPE>/);
  assert.match(xml, /<ID>DayBook<\/ID>/);
  assert.match(xml, /Abood Tradings/);
  assert.match(xml, /<SVFROMDATE TYPE="Date">20260101<\/SVFROMDATE>/);
  assert.match(xml, /<SVTODATE TYPE="Date">20260131<\/SVTODATE>/);
});

test("rejects malformed ISO dates instead of sending unbounded requests", () => {
  assert.throws(
    () => dataRequest("DayBook", { company: "Abood Tradings", fromDate: "01-04-2022" }),
    /expected YYYY-MM-DD/,
  );
});
