import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TallyClient } from "./tally-client.js";
import { snapshotCompany } from "./snapshot.js";

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
    assert.equal(manifest.segments.length, 5);
    assert.ok(manifest.segments.every((segment: { path: string }) => segment.path.endsWith(".json")));
    const folder = join(outputDir, "jsonex", "Abood_Tradings");
    const files = await readdir(folder);
    assert.equal(files.filter((name) => name.endsWith(".json")).length, 6); // five sources plus manifest
    const manifestText = await readFile(join(folder, "manifest.json"), "utf8");
    assert.equal(JSON.parse(manifestText).stagingCompatible, false);
    const rawSource = await readFile(manifest.segments[0].path, "utf8");
    assert.equal(rawSource, responseBody);
    assert.equal(payloads.length, 5);
    assert.ok(payloads.every((payload) => JSON.parse(payload).static_variables[0].value === "JSONEx"));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
