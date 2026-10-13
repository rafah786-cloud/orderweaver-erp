import { describe, expect, it } from "vitest";
import {
  canSetWorkbenchStatus,
  getWorkbenchSearchColumns,
  isGovernedWorkbenchStatus,
  normalizeWorkbenchSearch,
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
      { key: "status", type: "select" },
      { key: "quantity", type: "number" },
      { key: "notes", type: "textarea" },
      { key: "defaultText" },
      { key: "code", type: "text" },
    ])).toEqual(["code", "status", "defaultText"]);
  });

  it.each(["approved", "released", "posted", "dispatched", "completed", "closed", "locked", "paid"])(
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
    expect(canSetWorkbenchStatus("draft", "posted")).toBe(true);
  });
});
