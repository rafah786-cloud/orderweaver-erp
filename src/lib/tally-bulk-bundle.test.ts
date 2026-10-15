import { describe, expect, it } from "vitest";
import { buildTallyStagingBundles } from "./tally-bulk-bundle";
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
});