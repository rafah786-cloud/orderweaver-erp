import assert from "node:assert/strict";
import test from "node:test";
import { TallyClient, collectionRequest, dataRequest } from "./tally-client.js";

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

test("JSONEx collection payload pins company, format and exact date bounds", () => {
  const options = { company: "A & B", fromDate: "2026-04-01", toDate: "2026-10-06", format: "JSONEx" as const };
  const payload = JSON.parse(collectionRequest("List of Ledgers", options));
  assert.deepEqual(payload.static_variables, [
    { name: "svExportFormat", value: "JSONEx" },
    { name: "svCurrentCompany", value: "A & B" },
    { name: "SVFROMDATE", value: "20260401" },
    { name: "SVTODATE", value: "20261006" },
  ]);
});

test("JSONEx data payload uses the same explicit source-company/date contract", () => {
  const payload = JSON.parse(dataRequest("DayBook", { company: "Abood Tradings", fromDate: "2026-01-01", toDate: "2026-01-31", format: "JSONEx" }));
  assert.deepEqual(payload.static_variables, [
    { name: "svExportFormat", value: "JSONEx" },
    { name: "svCurrentCompany", value: "Abood Tradings" },
    { name: "SVFROMDATE", value: "20260101" },
    { name: "SVTODATE", value: "20260131" },
  ]);
});

test("JSONEx never exports against an implicit active company and rejects invalid date values", () => {
  assert.throws(() => collectionRequest("Ledger", { company: "", format: "JSONEx" }), /explicit Tally company/);
  assert.throws(() => dataRequest("DayBook", { company: "Abood Tradings", fromDate: "2026-02-30", format: "JSONEx" }), /valid calendar dates/);
});

test("JSONEx client preserves original response bytes and rejects unsuccessful status", async () => {
  const originalFetch = globalThis.fetch;
  const options = { company: "Abood Tradings", fromDate: "2026-01-01", toDate: "2026-01-31", format: "JSONEx" as const };
  const responseText = '{"status":"1","data":{"Ledger":[{"name":"Cash"}]}}';
  try {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(init?.headers && (init.headers as Record<string, string>).Tallyrequest, "Export");
      assert.equal((init?.headers as Record<string, string>).Type, "Data");
      assert.equal((init?.headers as Record<string, string>).Id, "DayBook");
      assert.equal((init?.headers as Record<string, string>)["Content-Type"], "application/json");
      return new Response(responseText, { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const client = new TallyClient("http://127.0.0.1:9000");
    const result = await client.request("DayBook", dataRequest("DayBook", options), options);
    assert.equal(result.format, "JSONEx");
    assert.equal(result.body, responseText);
    assert.equal(result.bytes, Buffer.byteLength(responseText, "utf8"));

    globalThis.fetch = (async () => new Response('{"status":"0","data":{}}', { status: 200 })) as typeof fetch;
    await assert.rejects(client.request("DayBook", dataRequest("DayBook", options), options), /JSON status=0/);

    globalThis.fetch = (async () => new Response("<not-json>", { status: 200 })) as typeof fetch;
    await assert.rejects(client.request("DayBook", dataRequest("DayBook", options), options), /malformed JSONEx/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
