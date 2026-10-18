import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../routes/_app.shop-floor.tsx", import.meta.url), "utf8");

describe("Shop-floor execution contract", () => {
  it("reads orders, approved routings, work centres and operations through active-company scope", () => {
    expect(source).toContain('.eq("company_id", activeCompany!.id)');
    expect(source).toContain('from("production_orders")');
    expect(source).toContain('from("routings")');
    expect(source).toContain('from("routing_operations")');
    expect(source).toContain('from("work_centers")');
    expect(source).toContain('from("production_operations")');
  });

  it("blocks duplicate routing generation and routes that are not effective", () => {
    expect(source).toContain("Operations already exist for this order; duplicate routing generation is blocked.");
    expect(source).toContain("The selected routing is not effective today.");
    expect(source).toContain('eq("status", "approved")');
  });

  it("enforces operation sequence and measurable output balance", () => {
    expect(source).toContain("A preceding operation must be completed or formally cancelled first.");
    expect(source).toContain("Good + scrap + rework must equal the planned quantity");
  });

  it("requires passed in-process quality before a mandatory-QC operation can complete", () => {
    expect(source).toContain("passed in-process QC inspection");
    expect(source).toContain('eq("stage", "in_process")');
    expect(source).toContain('eq("status", "passed")');
  });

  it("does not create inventory or accounting postings from operation reporting", () => {
    expect(source).toContain("It does not consume stock, post accounting or receive finished goods.");
    expect(source).toContain("Inventory consumption and finished-goods receipts require their separate guarded posting workflows.");
  });
});
