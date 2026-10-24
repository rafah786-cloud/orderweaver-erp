import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TallyClient } from "./tally-client.js";
import { snapshotCompany, validateSnapshotOptions } from "./snapshot.js";

test("JSONEx snapshot preserves raw JSON and writes a non-staging-compatible separate manifest", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "tally-jsonex-snapshot-"));
  const payloads: string[] = [];
  const responseBody = '{"status":"1","data":{"Ledger":[{"name":"Cash"}]}}';
  const fakeClient = {
    request: async (_name: string, body: string, options: { company: string; format?: "XML" | "JSONEx" }) => {
      payloads.push(body);
      return {
        company: options.company,
        requestName: _name,
        requestedAt: "2026-10-24T00:00:00.000Z",
        status: 1,
        format: options.format ?? "XML",
        body: responseBody,
        bytes: Buffer.byteLength(responseBody, "utf8"),
      };
    },
  } as unknown as TallyClient;

  try {
    const manifest = await snapshotCompany(fakeClient, {
      company: "Abood Tradings",
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      outputDir,
      includeDayBook: false,
      chunkMonths: 1,
      format: "JSONEx",
    });
    assert.equal(manifest.format, "JSONEx");
    assert.equal(manifest.stagingCompatible, false);
    assert.equal(manifest.sourceCoverage, "partial");
    assert.deepEqual(manifest.requestedMasterCollections, ["List of Ledgers", "List of Stock Items"]);
    assert.equal(manifest.segments.length, 2);
    assert.ok(manifest.segments.every((segment: { path: string }) => segment.path.endsWith(".json")));
    const jsonexRoot = join(outputDir, "jsonex");
    const [folderName] = await readdir(jsonexRoot);
    assert.match(folderName, /^Abood_Tradings-[a-f0-9]{10}$/);
    const folder = join(jsonexRoot, folderName);
    const files = await readdir(folder);
    assert.equal(files.filter((name) => name.endsWith(".json")).length, 3); // two sources plus manifest
    const manifestText = await readFile(join(folder, "manifest.json"), "utf8");
    assert.equal(JSON.parse(manifestText).stagingCompatible, false);
    assert.equal(JSON.parse(manifestText).sourceCoverage, "partial");
    const rawSource = await readFile(manifest.segments[0].path, "utf8");
    assert.equal(rawSource, responseBody);
    assert.equal(payloads.length, 2);
    assert.ok(payloads.every((payload) => JSON.parse(payload).static_variables[0].value === "JSONEx"));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});


test("monthly Day Book windows stay contiguous around month-end dates", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "tally-monthly-windows-"));
  const dayBookRanges: Array<{ fromDate?: string; toDate?: string }> = [];
  const responseBody = '{"status":"1","data":[]}';
  const fakeClient = {
    request: async (name: string, _body: string, options: { company: string; format?: "XML" | "JSONEx"; fromDate?: string; toDate?: string }) => {
      if (name === "DayBook") dayBookRanges.push({ fromDate: options.fromDate, toDate: options.toDate });
      return {
        company: options.company,
        requestName: name,
        requestedAt: "2026-10-24T00:00:00.000Z",
        status: 1,
        format: options.format ?? "XML",
        body: responseBody,
        bytes: Buffer.byteLength(responseBody, "utf8"),
      };
    },
  } as unknown as TallyClient;

  try {
    await snapshotCompany(fakeClient, {
      company: "Abood Tradings",
      fromDate: "2026-01-31",
      toDate: "2026-03-31",
      outputDir,
      includeDayBook: true,
      chunkMonths: 1,
      format: "JSONEx",
    });
    assert.deepEqual(dayBookRanges, [
      { fromDate: "2026-01-31", toDate: "2026-02-27" },
      { fromDate: "2026-02-28", toDate: "2026-03-27" },
      { fromDate: "2026-03-28", toDate: "2026-03-31" },
    ]);
    for (let i = 1; i < dayBookRanges.length; i++) {
      const previousToDate: string | undefined = dayBookRanges[i - 1].toDate;
      const currentFromDate: string | undefined = dayBookRanges[i].fromDate;
      assert.ok(previousToDate, "previous date chunk must have an end date");
      const previousEnd: Date = new Date(previousToDate + "T00:00:00Z");
      previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
      assert.equal(previousEnd.toISOString().slice(0, 10), currentFromDate);
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});


test("snapshot options reject blank company, invalid dates, reversed ranges and unsafe chunk sizes", () => {
  const base = {
    company: "Abood Tradings",
    fromDate: "2026-04-01",
    toDate: "2026-04-30",
    outputDir: "/tmp/tally-snapshots",
    includeDayBook: false,
    chunkMonths: 1,
    format: "XML" as const,
  };
  assert.doesNotThrow(() => validateSnapshotOptions(base));
  assert.throws(() => validateSnapshotOptions({ ...base, company: "  " }), /explicit Tally company/);
  assert.throws(() => validateSnapshotOptions({ ...base, fromDate: "2026-02-30" }), /valid calendar dates/);
  assert.throws(() => validateSnapshotOptions({ ...base, fromDate: "2026-05-01", toDate: "2026-04-30" }), /on or before/);
  assert.throws(() => validateSnapshotOptions({ ...base, chunkMonths: 1.5 }), /whole number/);
  assert.throws(() => validateSnapshotOptions({ ...base, chunkMonths: 121 }), /1 to 120/);
});


test("XML snapshots include the Unit of Measure master needed by inventory imports", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "tally-xml-units-"));
  const requestedCollections: string[] = [];
  const responseBody = "<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY/></ENVELOPE>";
  const fakeClient = {
    request: async (name: string, _body: string, options: { company: string; format?: "XML" | "JSONEx" }) => {
      requestedCollections.push(name);
      return {
        company: options.company,
        requestName: name,
        requestedAt: "2026-10-24T00:00:00.000Z",
        status: 1,
        format: options.format ?? "XML",
        body: responseBody,
        bytes: Buffer.byteLength(responseBody, "utf8"),
      };
    },
  } as unknown as TallyClient;
  try {
    const manifest = await snapshotCompany(fakeClient, {
      company: "Abood Tradings",
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      outputDir,
      includeDayBook: false,
      chunkMonths: 1,
      format: "XML",
    });
    assert.ok(requestedCollections.includes("List of Units"));
    assert.equal(manifest.segments.length, 6);
    assert.ok(manifest.segments.every((segment: { path: string }) => segment.path.endsWith(".xml")));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});


test("JSONEx folders stay isolated when different company names sanitize to the same slug", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "tally-jsonex-collision-"));
  const responseBody = '{"status":"1","data":[]}';
  const fakeClient = {
    request: async (_name: string, _body: string, options: { company: string; format?: "XML" | "JSONEx" }) => ({
      company: options.company,
      requestName: _name,
      requestedAt: "2026-10-24T00:00:00.000Z",
      status: 1,
      format: options.format ?? "XML",
      body: responseBody,
      bytes: Buffer.byteLength(responseBody, "utf8"),
    }),
  } as unknown as TallyClient;
  try {
    await snapshotCompany(fakeClient, {
      company: "A&B",
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      outputDir,
      includeDayBook: false,
      chunkMonths: 1,
      format: "JSONEx",
    });
    await snapshotCompany(fakeClient, {
      company: "A B",
      fromDate: "2026-04-01",
      toDate: "2026-04-30",
      outputDir,
      includeDayBook: false,
      chunkMonths: 1,
      format: "JSONEx",
    });
    const root = join(outputDir, "jsonex");
    const folders = await readdir(root);
    assert.equal(folders.length, 2);
    assert.ok(folders.every((name) => /^A_B-[a-f0-9]{10}$/.test(name)));
    const companies = await Promise.all(folders.map(async (name) => {
      const manifest = JSON.parse(await readFile(join(root, name, "manifest.json"), "utf8")) as { company: string };
      return manifest.company;
    }));
    assert.deepEqual(companies.sort(), ["A B", "A&B"]);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
