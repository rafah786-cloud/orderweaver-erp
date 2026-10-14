import { describe, expect, it } from "vitest";
import { validateCapaActionCompletion } from "./capa-action-guards";

describe("CAPA action completion guard", () => {
  it("requires a substantive effectiveness result", () => {
    expect(validateCapaActionCompletion("")).toMatch(/effectiveness result/);
    expect(validateCapaActionCompletion("OK")).toMatch(/at least 10 characters/);
    expect(validateCapaActionCompletion("   ")).toMatch(/effectiveness result/);
  });
  it("accepts a documented effectiveness result", () => {
    expect(validateCapaActionCompletion("Verified on the next batch")).toBeNull();
  });
});
