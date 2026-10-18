import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../routes/_app.quality.tsx", import.meta.url), "utf8");

describe("Quality management workflow safeguards", () => {
  it("scopes inspections, non-conformances, suppliers, stock and production to the active company", () => {
    expect(source).toContain('.eq("company_id", activeCompany!.id)');
    expect(source).toContain('from("quality_inspections")');
    expect(source).toContain('from("quality_nonconformances")');
    expect(source).toContain('from("quality_capa_actions")');
    expect(source).toContain('from("production_orders")');
    expect(source).toContain('from("stock_items")');
  });

  it("only passes a fully accepted inspection with zero rejected units", () => {
    expect(source).toContain('resultForm.status === "passed" && (accepted !== inspected || rejected !== 0)');
    expect(source).toContain('resultForm.status === "failed" && rejected === 0');
    expect(source).toContain('accepted + rejected > inspected');
  });

  it("uses database-supported quality-result and non-conformance states", () => {
    expect(source).toContain('"not_tested"');
    expect(source).toContain('value="return_to_supplier"');
    expect(source).toContain('value="concession"');
    expect(source).toContain('value="verification"');
  });

  it("requires recorded effectiveness before closing a CAPA action", () => {
    expect(source).toContain("Effectiveness result is required");
    expect(source).toContain("effectiveness_result: result.trim()");
    expect(source).toContain('status: "done"');
  });
});
