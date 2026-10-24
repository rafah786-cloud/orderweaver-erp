import assert from "node:assert/strict";
import test from "node:test";
import { TallyClient, collectionRequest, dataRequest, jsonExCollectionId } from "./tally-client.js";

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
    { type: "String", key: "", name: "svExportFormat", value: "JSONEx" },
    { type: "String", key: "", name: "svCurrentCompany", value: "A & B" },
    { type: "Date", key: "", name: "SVFROMDATE", value: "20260401" },
    { type: "Date", key: "", name: "SVTODATE", value: "20261006" },
  ]);
});

test("JSONEx data payload uses the same explicit source-company/date contract", () => {
  const payload = JSON.parse(dataRequest("DayBook", { company: "Abood Tradings", fromDate: "2026-01-01", toDate: "2026-01-31", format: "JSONEx" }));
  assert.deepEqual(payload.static_variables, [
    { type: "String", key: "", name: "svExportFormat", value: "JSONEx" },
    { type: "String", key: "", name: "svCurrentCompany", value: "Abood Tradings" },
    { type: "Date", key: "", name: "SVFROMDATE", value: "20260101" },
    { type: "Date", key: "", name: "SVTODATE", value: "20260131" },
  ]);
});

test("JSONEx never exports against an implicit active company and rejects invalid or reversed date ranges", () => {
  assert.throws(() => collectionRequest("Ledger", { company: "", format: "JSONEx" }), /explicit Tally company/);
  assert.throws(() => dataRequest("DayBook", { company: "Abood Tradings", fromDate: "2026-02-30", format: "JSONEx" }), /valid calendar dates/);
  assert.throws(() => dataRequest("DayBook", { company: "Abood Tradings", fromDate: "2026-03-01", toDate: "2026-02-28", format: "JSONEx" }), /fromDate on or before toDate/);
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


test("XML business-data requests require an explicit company while company discovery remains available", () => {
  assert.throws(() => collectionRequest("List of Ledgers", { company: "" }), /explicit Tally company/);
  assert.throws(() => dataRequest("DayBook", { company: "   " }), /explicit Tally company/);
  const companyList = collectionRequest("List of Companies", { company: "" });
  assert.ok(companyList.includes("<ID>List of Companies</ID>"));
  assert.doesNotMatch(companyList, /<SVCURRENTCOMPANY/);
});

test("JSONEx master collection labels map to native Tally collection IDs and unknown names fail closed", () => {
  assert.equal(jsonExCollectionId("List of Ledgers"), "Ledger");
  assert.equal(jsonExCollectionId("List of Stock Items"), "StockItem");
  assert.equal(jsonExCollectionId("DayBook"), "TSPLVoucherColl");
  assert.throws(() => jsonExCollectionId("List of Groups"), /No verified JSONEx collection mapping/);
  assert.throws(() => jsonExCollectionId("List of Godowns"), /No verified JSONEx collection mapping/);
  assert.throws(() => jsonExCollectionId("List of Cost Centres"), /No verified JSONEx collection mapping/);
  assert.throws(() => jsonExCollectionId("Unknown Custom Collection"), /No verified JSONEx collection mapping/);
});

test("JSONEx collection client sends the documented native collection identifier", async () => {
  const originalFetch = globalThis.fetch;
  let requestedId = "";
  const options = { company: "Abood Tradings", format: "JSONEx" as const };
  try {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestedId = (init?.headers as Record<string, string>).Id;
      return new Response('{"status":"1","data":{"Ledger":[]}}', { status: 200 });
    }) as typeof fetch;
    const client = new TallyClient("http://127.0.0.1:9000");
    await client.request("List of Ledgers", collectionRequest("List of Ledgers", options), options);
    assert.equal(requestedId, "Ledger");
    const voucherOptions = { ...options, requestType: "Collection" as const };
    await client.request("DayBook", collectionRequest("DayBook", voucherOptions), voucherOptions);
    assert.equal(requestedId, "TSPLVoucherColl");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("JSONEx report requests can explicitly use the Data header instead of Collection", async () => {
  const originalFetch = globalThis.fetch;
  const options = { company: "Abood Tradings", format: "JSONEx" as const, requestType: "Data" as const };
  let headers: Record<string, string> = {};
  try {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>;
      return new Response('{"status":"1","data":{}}', { status: 200 });
    }) as typeof fetch;
    const client = new TallyClient("http://127.0.0.1:9000");
    await client.request("Balance Sheet", dataRequest("Balance Sheet", options), options);
    assert.equal(headers.Type, "Data");
    assert.equal(headers.Id, "Balance Sheet");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("connection ping uses company discovery rather than exporting business ledgers", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody = "";
  try {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return new Response("<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER></ENVELOPE>", { status: 200 });
    }) as typeof fetch;
    const client = new TallyClient("http://127.0.0.1:9000");
    await client.ping();
    assert.ok(sentBody.includes("<ID>List of Companies</ID>"));
    assert.ok(sentBody.includes("<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>"));
    assert.ok(!sentBody.includes("<ID>List of Ledgers</ID>"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
