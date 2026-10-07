import assert from "node:assert/strict";
import test from "node:test";
import { collectionRequest, dataRequest } from "./tally-client.js";

test("collection requests pin the selected Tally company and XML export format", () => {
  const xml = collectionRequest("List of Ledgers", {
    company: "A & B <Test>",
    fromDate: "2026-04-01",
    toDate: "2026-10-06",
  });
  assert.match(xml, /<SVCURRENTCOMPANY TYPE="String">A &amp; B &lt;Test&gt;<\/SVCURRENTCOMPANY>/);
  assert.match(xml, /<SVEXPORTFORMAT>\$\$SysName:XML<\/SVEXPORTFORMAT>/);
  assert.match(xml, /<SVFROMDATE TYPE="Date">2026-04-01<\/SVFROMDATE>/);
  assert.match(xml, /<SVTODATE TYPE="Date">2026-10-06<\/SVTODATE>/);
});

test("data requests are company-qualified and date-bounded", () => {
  const xml = dataRequest("DayBook", {
    company: "Abood Tradings",
    fromDate: "2026-01-01",
    toDate: "2026-01-31",
  });
  assert.match(xml, /<TYPE>Data<\/TYPE>/);
  assert.match(xml, /<ID>DayBook<\/ID>/);
  assert.match(xml, /Abood Tradings/);
});
