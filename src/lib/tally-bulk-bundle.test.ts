import { describe, expect, it } from "vitest";
import { buildTallyStagingBundles, buildTallyXmlBundle, hashTallyFile } from "./tally-bulk-bundle";
import { archiveTallyStaging } from "./tally-bulk-archive";
import { sha256, TALLY_SOURCES } from "./tally-bulk";
import { unzipSync } from "fflate";

function file(name: string, data: string, path: string): File {
  const blob = new Blob([data]);
  Object.defineProperties(blob, { name: { value: name }, webkitRelativePath: { value: path } });
  return blob as File;
}
async function fixture() {
  const files: File[] = [];
  for (const [index, company] of TALLY_SOURCES.entries()) {
    const dir = `snapshots/${index}/`;
    const xml = `<ENVELOPE><BODY><DATA><TALLYMESSAGE><GROUP NAME="Assets"><GUID>same-guid</GUID><ALTERID>1</ALTERID><MASTERID>1</MASTERID><OPENINGBALANCE>10</OPENINGBALANCE></GROUP></TALLYMESSAGE></DATA></BODY></ENVELOPE>`;
    const source = file("masters.xml", xml, dir + "masters.xml");
    files.push(source, file("manifest.json", JSON.stringify({ company, bridgeVersion: "1.0.9", segments: [{ path: "C:\\snapshots\\masters.xml", bytes: source.size, sha256: await sha256(await source.arrayBuffer()) }] }), dir + "manifest.json"));
  }
  return files;
}
describe("four-company bundle preparation", () => {
  it("isolates same source IDs across companies, keeps originals and reproduces rows on retry", async () => {
    const files = await fixture();
    const a = await buildTallyStagingBundles(files, () => {}), b = await buildTallyStagingBundles(files, () => {});
    expect(a.summaries.map((s) => s.duplicates)).toEqual([0, 0, 0, 0]);
    expect(a.summaries.find((s) => s.company === "ESTIMATE")?.blockers.join(" ")).toContain("not eligible for official");
    for (let i = 0; i < a.files.length; i++) expect(await a.files[i].blob.text()).toBe(await b.files[i].blob.text());
    const zip = unzipSync(new Uint8Array(await (await archiveTallyStaging(a, files)).arrayBuffer()));
    expect(new TextDecoder().decode(zip["originals/snapshots/0/masters.xml"])).toBe(await files[0].text());
    expect(JSON.parse(new TextDecoder().decode(zip["REPORT.json"])).cloudTransferred).toBe(false);
  });
  it("fails closed on missing segments or altered original bytes", async () => {
    const files = await fixture();
    await expect(buildTallyStagingBundles(files.filter((_, i) => i !== 0), () => {})).rejects.toThrow(/missing/);
    files[0] = file("masters.xml", "changed", "snapshots/0/masters.xml");
    await expect(buildTallyStagingBundles(files, () => {})).rejects.toThrow(/differs/);
  });
  it("rejects incomplete four-company selection", async () => {
    await expect(buildTallyStagingBundles([], () => {})).rejects.toThrow(/four company/);
  });
  it("hashes source streams without requesting a whole-file buffer", async () => {
    const blob = new Blob(["original bytes"]);
    const expected = await sha256(await blob.arrayBuffer());
    Object.defineProperty(blob, "arrayBuffer", { value: () => { throw new Error("unbounded read"); } });
    expect(await hashTallyFile(blob)).toBe(expected);
  });
  it("accepts a direct UTF-16 ESTIMATE XML without guessing a company GUID", async () => {
    const xml = '<ENVELOPE><BODY><IMPORTDATA><REQUESTDESC><STATICVARIABLES><SVCURRENTCOMPANY>ESTIMATE</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA><TALLYMESSAGE><GROUP><GUID>g1</GUID><ALTERID>1</ALTERID></GROUP></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>';
    const bytes = new Uint8Array(2 + xml.length * 2); bytes[0] = 255; bytes[1] = 254;
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < xml.length; i++) view.setUint16(2 + i * 2, xml.charCodeAt(i), true);
    const result = await buildTallyXmlBundle(new File([bytes], "Master.xml"), () => {});
    expect(result.summaries[0]).toMatchObject({ company: "ESTIMATE", companyGuid: null, rows: 1 });
    expect(result.summaries[0].blockers.join(" ")).toContain("not eligible for official");
    expect(result.files.some((entry) => entry.name === "generated-local-manifest.json")).toBe(true);
  });
  it("rejects direct ZIP archives and XML without explicit source identity", async () => {
    await expect(buildTallyXmlBundle(new File(["zip"], "165MB.zip"), () => {})).rejects.toThrow(/Extract/);
    await expect(buildTallyXmlBundle(new File(['<ENVELOPE><BODY><DATA><TALLYMESSAGE><GROUP /></TALLYMESSAGE></DATA></BODY></ENVELOPE>'], "unknown.xml"), () => {})).rejects.toThrow(/SVCURRENTCOMPANY/);
  });
  it("rejects duplicated paths rather than selecting an arbitrary source", async () => {
    const files = await fixture();
    await expect(buildTallyStagingBundles([...files, files[0]], () => {})).rejects.toThrow(/Duplicate source file paths/);
  });
  it("accepts repository schema v1 without claiming installed 1.0.9 provenance", async () => {
    const files = await fixture();
    const manifest = JSON.parse(await files[1].text());
    delete manifest.bridgeVersion; manifest.schemaVersion = 1;
    files[1] = file("manifest.json", JSON.stringify(manifest), "snapshots/0/manifest.json");
    const result = await buildTallyStagingBundles(files, () => {});
    expect(result.summaries[0].blockers.join(" ")).toContain("does not establish TallyBridge 1.0.9");
  });
  it("requires exact integer bytes, a valid checksum and known schema version", async () => {
    for (const patch of [{ bytes: undefined }, { bytes: -1 }, { bytes: "12" }, { sha256: "abc" }]) {
      const files = await fixture(); const manifest = JSON.parse(await files[1].text());
      Object.assign(manifest.segments[0], patch);
      files[1] = file("manifest.json", JSON.stringify(manifest), "snapshots/0/manifest.json");
      await expect(buildTallyStagingBundles(files, () => {})).rejects.toThrow(/exact bytes/);
    }
    const files = await fixture(); const manifest = JSON.parse(await files[1].text()); manifest.schemaVersion = 2;
    files[1] = file("manifest.json", JSON.stringify(manifest), "snapshots/0/manifest.json");
    await expect(buildTallyStagingBundles(files, () => {})).rejects.toThrow(/Unsupported/);
  });
  it("resolves relative subdirectories without silently using another file's basename", async () => {
    const files = await fixture(); const manifest = JSON.parse(await files[1].text()); manifest.segments[0].path = "nested/masters.xml";
    files[1] = file("manifest.json", JSON.stringify(manifest), "snapshots/0/manifest.json");
    await expect(buildTallyStagingBundles(files, () => {})).rejects.toThrow(/missing/);
    files[0] = file("masters.xml", await files[0].text(), "snapshots/0/nested/masters.xml");
    expect((await buildTallyStagingBundles(files, () => {})).summaries[0].rows).toBe(1);
    manifest.segments[0].path = "../masters.xml";
    files[1] = file("manifest.json", JSON.stringify(manifest), "snapshots/0/manifest.json");
    await expect(buildTallyStagingBundles(files, () => {})).rejects.toThrow(/Unsafe/);
  });
  it("reproduces evidence independent of the browser's file selection order", async () => {
    const files = await fixture();
    const a = await buildTallyStagingBundles(files, () => {}), b = await buildTallyStagingBundles([...files].reverse(), () => {});
    expect(a.summaries).toEqual(b.summaries);
    expect(await Promise.all(a.files.map((f) => f.blob.text()))).toEqual(await Promise.all(b.files.map((f) => f.blob.text())));
  });
  it("reports per-file record types and folder files missing from the manifest", async () => {
    const files = [...await fixture(), file("source-x.xml", "<x/>", "snapshots/0/source-x.xml")];
    const r = await buildTallyStagingBundles(files, () => {});
    const s = r.summaries.find((x) => x.unlistedFiles.length)!;
    expect(s.unlistedFiles).toEqual(["source-x.xml"]);
    expect(s.segments[0]).toMatchObject({ name: "masters.xml", messages: 1, byType: { GROUP: 1 } });
    expect(s.blockers.join(" ")).toContain("not listed in manifest.json");
  });
  it("hashes large files incrementally with progress and yields", async () => {
    const big = new Blob([new Uint8Array(40 * 1024 * 1024).fill(7)]);
    const seen: number[] = [];
    const hex = await hashTallyFile(big, (b) => seen.push(b));
    expect(hex).toBe(await sha256(await big.arrayBuffer()));
    expect(seen.at(-1)).toBe(big.size); expect(seen.length).toBeGreaterThan(1);
  });
  it("rejects with a clear error (not a hang) when a file differs from its manifest", async () => {
    const files = await fixture();
    files[0] = file("masters.xml", "<changed/>", files[0].webkitRelativePath);
    await expect(buildTallyStagingBundles(files, () => {})).rejects.toThrow(/differs from its manifest/);
  });
});
