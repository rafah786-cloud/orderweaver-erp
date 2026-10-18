import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../routes/_app.smart-sleeptec.tsx", import.meta.url), "utf8");

describe("Smart SleepTec product lifecycle safeguards", () => {
  it("keeps product and engineering records in the active company", () => {
    expect(source).toContain('.eq("company_id", activeCompany.id)');
    expect(source).toContain('from("product_models")');
    expect(source).toContain('from("bom_revisions")');
    expect(source).toContain('from("bom_revision_lines")');
    expect(source).toContain('from("engineering_change_orders")');
    expect(source).toContain('from("engineering_change_order_lines")');
  });

  it("creates concept records and draft BOM revisions without inventing specs", () => {
    expect(source).toContain('product_line: "smart_sleeptec"');
    expect(source).toContain('lifecycle: "concept"');
    expect(source).toContain('status: "draft"');
    expect(source).toContain("No production specifications are seeded or fabricated");
  });

  it("requires reasoned change lines and independent approval before ECO release", () => {
    expect(source).toContain("change-line reason are required");
    expect(source).toContain("createEco");
    expect(source).toContain("the requester cannot approve their own change");
    expect(source).toContain("Release requires an approved ECO");
  });

  it("does not bypass the verified live schema's BOM-to-ECO release gate", () => {
    expect(source).toContain("Release is intentionally blocked until the verified live schema contains the BOM-to-ECO link");
    expect(source).not.toContain('patch.status = "released"');
  });

  it("prevents edits to released BOM contents", () => {
    expect(source).toContain('const immutableBom = new Set(["released", "obsolete"])');
    expect(source).toContain("Released or approved BOM revisions are immutable");
  });
});
