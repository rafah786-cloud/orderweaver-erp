import { describe, it, expect } from "vitest";
import { scanTallyFolder } from "./tally-folder-scan";
const f = (p: string) => ({ name: p.split("/").pop()!, webkitRelativePath: p });
describe("scanTallyFolder", () => {
  it("detects four company folders including nested files", () => {
    const s = scanTallyFolder(["exports/ABOOD_TRADINGS/manifest.json", "exports/ABOOD_TRADINGS/x/a.xml", "exports/ABRAZ_SLEEPING_SOLUTIONS/manifest.json", "exports/ABZ_EST/manifest.json", "exports/ESTIMATE/manifest.json"].map(f));
    expect(s.missing).toEqual([]); expect(s.unsupported).toEqual([]);
    expect(s.companies.find((c) => c.company === "ABOOD TRADINGS")).toMatchObject({ files: 2, xml: 1, manifests: 1 });
  });
  it("reports missing and unsupported folders", () => {
    const s = scanTallyFolder(["exports/ESTIMATE/a.xml", "exports/OTHER/b.xml"].map(f));
    expect(s.missing).toHaveLength(3); expect(s.unsupported).toEqual(["exports/OTHER"]);
  });
});
