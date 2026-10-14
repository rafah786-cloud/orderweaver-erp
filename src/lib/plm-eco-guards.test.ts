import { describe, expect, it } from "vitest";
import { isReleasedEngineeringArtifactImmutable, validateBomRevisionRelease, validateEcoTransition, type EcoSnapshot } from "./plm-eco-guards";

const eco = (overrides: Partial<EcoSnapshot> = {}): EcoSnapshot => ({
  id: "eco-1", companyId: "company-a", status: "released", requestedBy: "user-a", approvedBy: "user-b",
  effectiveFrom: "2026-10-01", releasedAt: "2026-10-01T08:00:00Z", lineCount: 1, allLinesHaveReason: true, ...overrides,
});
const revision = (overrides: Partial<Parameters<typeof validateBomRevisionRelease>[0]> = {}) => ({
  companyId: "company-a", status: "approved" as const, effectiveFrom: "2026-10-01", effectiveTo: null,
  changeOrder: eco(), changeOrderReferencesRevision: true, ...overrides,
});

describe("engineering change order governance", () => {
  it("requires independent approval, a reasoned change line and an effective date", () => {
    expect(validateEcoTransition("review", "approved", { ...eco(), approvedBy: "user-a" }, "2026-10-14")).toMatch(/cannot approve their own/);
    expect(validateEcoTransition("review", "approved", { ...eco(), lineCount: 0 }, "2026-10-14")).toMatch(/at least one change line/);
    expect(validateEcoTransition("review", "approved", { ...eco(), allLinesHaveReason: false }, "2026-10-14")).toMatch(/change reason/);
    expect(validateEcoTransition("review", "approved", { ...eco(), effectiveFrom: null }, "2026-10-14")).toMatch(/effective date/);
  });
  it("rejects skipped workflow stages and changes after release", () => {
    expect(validateEcoTransition("draft", "released", eco(), "2026-10-14")).toMatch(/cannot transition/);
    expect(validateEcoTransition("released", "cancelled", eco(), "2026-10-14")).toMatch(/cannot transition/);
    expect(isReleasedEngineeringArtifactImmutable("released")).toBe(true);
    expect(isReleasedEngineeringArtifactImmutable("obsolete")).toBe(true);
  });
  it("prevents release before effective date and requires a released same-company ECO", () => {
    expect(validateEcoTransition("approved", "released", { ...eco(), effectiveFrom: "2026-12-01" }, "2026-10-14")).toMatch(/future-effective/);
    expect(validateBomRevisionRelease(revision({ changeOrder: eco({ companyId: "company-b" }) }), "2026-10-14")).toMatch(/same company/);
    expect(validateBomRevisionRelease(revision({ changeOrder: eco({ status: "approved", releasedAt: null }) }), "2026-10-14")).toMatch(/must be released/);
    expect(validateBomRevisionRelease(revision({ changeOrderReferencesRevision: false }), "2026-10-14")).toMatch(/change line/);
  });
  it("accepts a revision only with matching effective dates and a linked released ECO", () => {
    expect(validateBomRevisionRelease(revision(), "2026-10-14")).toBeNull();
    expect(validateBomRevisionRelease(revision({ effectiveTo: "2026-09-30" }), "2026-10-14")).toMatch(/on or after/);
    expect(validateBomRevisionRelease(revision({ effectiveFrom: "2026-11-01" }), "2026-10-14")).toMatch(/future-effective/);
    expect(validateBomRevisionRelease(revision({ effectiveFrom: "2026-10-02" }), "2026-10-14")).toMatch(/effective dates must match/);
  });
});
