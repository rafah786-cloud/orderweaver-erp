import { describe, expect, it } from "vitest";
import { validateWorkbenchDateRanges, validateWorkbenchFieldValue } from "./enterprise-workbench-guards";
import {
  canSetWorkbenchStatus,
  getWorkbenchSearchColumns,
  isGovernedWorkbenchStatus,
  normalizeWorkbenchSearch,
  validateQualityInspection,
} from "./enterprise-workbench-guards";

describe("enterprise workbench guard helpers", () => {
  it("normalizes search input and removes PostgREST filter syntax", () => {
    expect(normalizeWorkbenchSearch('  Queen,(King) "Memory Foam" %_  '))
      .toBe("Queen King Memory Foam");
  });

  it("caps query length to avoid oversized filter strings", () => {
    expect(normalizeWorkbenchSearch("a".repeat(200))).toHaveLength(80);
  });

  it("only searches scalar text and select fields", () => {
    expect(getWorkbenchSearchColumns([
      { key: "code", type: "text" },
      { key: "status", type: "select", options: ["draft", "released"] },
      { key: "active", type: "select", options: ["true", "false"] },
      { key: "quantity", type: "number" },
      { key: "party_id", type: "text" },
      { key: "entity_id", type: "text" },
      { key: "notes", type: "textarea" },
      { key: "defaultText" },
      { key: "code", type: "text" },
    ])).toEqual(["code", "status", "defaultText"]);
  });

  it.each(["approved", "released", "posted", "dispatched", "completed", "closed", "locked", "paid", "passed", "failed", "conditional", "sent", "rejected", "returned"])(
    "recognizes %s as a governed state",
    (status) => expect(isGovernedWorkbenchStatus(status)).toBe(true),
  );

  it("allows ordinary working states but blocks entering a governed state", () => {
    expect(canSetWorkbenchStatus("draft")).toBe(true);
    expect(canSetWorkbenchStatus("running")).toBe(true);
    expect(canSetWorkbenchStatus("released", "draft")).toBe(false);
    expect(canSetWorkbenchStatus("posted")).toBe(false);
  });

  it("permits retaining a governed state while editing unrelated fields", () => {
    expect(canSetWorkbenchStatus("released", "released")).toBe(true);
    expect(canSetWorkbenchStatus("Posted", "posted")).toBe(true);
    expect(canSetWorkbenchStatus("draft", "posted")).toBe(false);
    expect(canSetWorkbenchStatus("released", "posted")).toBe(false);
  });
});


describe("quality inspection result validation", () => {
  it("allows a passed inspection only when all inspected units are accepted", () => {
    expect(validateQualityInspection({ status: "passed", quantity_inspected: 10, quantity_accepted: 10, quantity_rejected: 0 })).toBeNull();
    expect(validateQualityInspection({ status: "passed", quantity_inspected: 10, quantity_accepted: 9, quantity_rejected: 1 }))
      .toMatch(/every inspected unit/);
  });

  it("requires completed inspection quantities to reconcile", () => {
    expect(validateQualityInspection({ status: "conditional", quantity_inspected: 10, quantity_accepted: 8, quantity_rejected: 1 }))
      .toMatch(/must equal/);
    expect(validateQualityInspection({ status: "conditional", quantity_inspected: 10, quantity_accepted: 8, quantity_rejected: 2 })).toBeNull();
  });

  it("requires at least one rejection for a failed inspection", () => {
    expect(validateQualityInspection({ status: "failed", quantity_inspected: 5, quantity_accepted: 5, quantity_rejected: 0 }))
      .toMatch(/at least one rejected/);
  });

  it("rejects zero inspected quantity and negative accepted/rejected quantities", () => {
    expect(validateQualityInspection({ status: "passed", quantity_inspected: 0, quantity_accepted: 0, quantity_rejected: 0 }))
      .toMatch(/at least one unit/);
    expect(validateQualityInspection({ status: "failed", quantity_inspected: 2, quantity_accepted: 3, quantity_rejected: -1 }))
      .toMatch(/cannot be negative/);
  });

  it("does not apply completion rules to an open inspection", () => {
    expect(validateQualityInspection({ status: "open", quantity_inspected: 0, quantity_accepted: 0, quantity_rejected: 0 })).toBeNull();
  });
});


describe("enterprise workbench field validation", () => {
  it("rejects blank required fields, non-finite numbers and out-of-range numbers", () => {
    expect(validateWorkbenchFieldValue({ label: "Code", required: true }, "   ")).toMatch(/required/);
    expect(validateWorkbenchFieldValue({ label: "Capacity", type: "number" }, "Infinity")).toMatch(/valid number/);
    expect(validateWorkbenchFieldValue({ label: "Efficiency", type: "number", min: 0, max: 100 }, "-1")).toMatch(/at least 0/);
    expect(validateWorkbenchFieldValue({ label: "Efficiency", type: "number", min: 0, max: 100 }, "101")).toMatch(/no more than 100/);
    expect(validateWorkbenchFieldValue({ label: "Efficiency", type: "number", min: 0, max: 100 }, "100")).toBeNull();
  });

  it("validates dates and rejects inverted planning/effective ranges", () => {
    expect(validateWorkbenchFieldValue({ label: "Start", type: "date" }, "not-a-date")).toMatch(/valid date\/time/);
    expect(validateWorkbenchDateRanges({ horizon_start: "2026-10-20", horizon_end: "2026-10-01" })).toMatch(/cannot be after/);
    expect(validateWorkbenchDateRanges({ effective_from: "2026-10-01", effective_to: "2026-10-20" })).toBeNull();
  });
});
