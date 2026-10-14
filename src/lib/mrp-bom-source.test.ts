import { describe, expect, it } from "vitest";
import { grossQuantityPerFinishedUnit, selectEffectiveReleasedBomRevisions, type BomRevisionCandidate } from "./mrp-bom-source";

const revision = (overrides: Partial<BomRevisionCandidate> = {}): BomRevisionCandidate => ({
  id: "rev-1",
  model_id: "model-1",
  revision: "A",
  status: "released",
  effective_from: "2026-01-01",
  effective_to: null,
  ...overrides,
});

describe("effective released BOM revision selection", () => {
  it("chooses the most recent effective released revision", () => {
    const result = selectEffectiveReleasedBomRevisions(
      ["model-1"],
      [revision(), revision({ id: "rev-2", revision: "B", effective_from: "2026-07-01" })],
      "2026-10-14",
    );
    expect(result.selectedByModel.get("model-1")?.id).toBe("rev-2");
    expect(result.missingEffectiveRevisionModelIds).toEqual([]);
  });

  it("does not select draft, approved-only, future, expired, or undated revisions", () => {
    const result = selectEffectiveReleasedBomRevisions(
      ["model-1"],
      [
        revision({ status: "draft" }),
        revision({ id: "rev-2", status: "approved" }),
        revision({ id: "rev-3", effective_from: "2027-01-01" }),
        revision({ id: "rev-4", effective_to: "2026-01-01" }),
        revision({ id: "rev-5", effective_from: null }),
      ],
      "2026-10-14",
    );
    expect(result.selectedByModel.has("model-1")).toBe(false);
    expect(result.missingEffectiveRevisionModelIds).toEqual(["model-1"]);
  });

  it("leaves models without any revision records eligible for legacy BOQ fallback", () => {
    const result = selectEffectiveReleasedBomRevisions(["legacy-model"], [], "2026-10-14");
    expect(result.selectedByModel.size).toBe(0);
    expect(result.missingEffectiveRevisionModelIds).toEqual([]);
  });
});


describe("BOM scrap allowance", () => {
  it("applies the existing recommendation-engine percentage convention", () => {
    expect(grossQuantityPerFinishedUnit(2, 10)).toBeCloseTo(2.2);
    expect(grossQuantityPerFinishedUnit(2, 0)).toBe(2);
  });

  it("clamps negative scrap percentages to zero", () => {
    expect(grossQuantityPerFinishedUnit(2, -10)).toBe(2);
  });

  it("rejects invalid quantities and non-finite scrap percentages", () => {
    expect(() => grossQuantityPerFinishedUnit(0, 0)).toThrow(/positive and finite/);
    expect(() => grossQuantityPerFinishedUnit(2, Number.NaN)).toThrow(/must be finite/);
  });
});
