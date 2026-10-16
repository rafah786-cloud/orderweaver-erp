import { describe, expect, it } from "vitest";
import {
  explodeMaterialRequirements,
  explodeMultiLevelMaterialRequirements,
  type MrpDemandLine,
  type MrpMultiLevelBomLine,
} from "./mrp-explosion";
import { selectEffectiveReleasedBomRevisions, grossQuantityPerFinishedUnit } from "./mrp-bom-source";
import { unnettedMaterialBalances } from "./mrp-availability";

const demand = (overrides: Partial<MrpDemandLine> = {}): MrpDemandLine => ({
  productionOrderId: "po-1",
  productionOrderNumber: "PRD-1",
  productModelId: "model-a",
  productModelName: "Spring Mattress",
  orderQuantity: 10,
  ...overrides,
});

describe("explodeMaterialRequirements (single-level)", () => {
  it("aggregates gross requirements across demand lines", () => {
    const result = explodeMaterialRequirements(
      [demand({ orderQuantity: 2 }), demand({ productionOrderId: "po-2", productionOrderNumber: "PRD-2", orderQuantity: 3 })],
      [{
        productModelId: "model-a",
        rawMaterialId: "raw:foam",
        rawMaterialName: "Foam",
        unit: "sheet",
        quantityPerFinishedUnit: 2,
      }],
      [{ rawMaterialId: "raw:foam", rawMaterialName: "Foam", unit: "sheet", availableQuantity: null }],
    );
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].grossRequired).toBe(10);
    expect(result.requirements[0].availableQuantity).toBeNull();
    expect(result.requirements[0].shortageQuantity).toBeNull();
    expect(result.status).toBe("insufficient-data");
  });

  it("rejects invalid demand and BOM without partial totals", () => {
    const result = explodeMaterialRequirements(
      [demand({ orderQuantity: 0 })],
      [{
        productModelId: "model-a",
        rawMaterialId: "raw:foam",
        rawMaterialName: "Foam",
        unit: "sheet",
        quantityPerFinishedUnit: 1,
      }],
      [],
    );
    expect(result.requirements).toEqual([]);
    expect(result.status).toBe("insufficient-data");
  });

  it("excludes unit mismatches from requirements", () => {
    const result = explodeMaterialRequirements(
      [demand()],
      [{
        productModelId: "model-a",
        rawMaterialId: "raw:foam",
        rawMaterialName: "Foam",
        unit: "sheet",
        quantityPerFinishedUnit: 1,
      }],
      [{ rawMaterialId: "raw:foam", rawMaterialName: "Foam", unit: "kg", availableQuantity: 100 }],
    );
    expect(result.requirements).toEqual([]);
    expect(result.missingMaterialMasters.some((m) => m.includes("unit"))).toBe(true);
  });
});

describe("explodeMultiLevelMaterialRequirements", () => {
  const bom: MrpMultiLevelBomLine[] = [
    {
      parentModelId: "model-a",
      componentType: "subassembly",
      componentId: "sub-spring",
      componentName: "Spring Unit",
      unit: "unit",
      quantityPerParent: 1,
      scrapPct: 0,
    },
    {
      parentModelId: "sub-spring",
      componentType: "raw-material",
      componentId: "raw:wire",
      componentName: "Spring Wire",
      unit: "kg",
      quantityPerParent: 2,
      scrapPct: 10,
    },
    {
      parentModelId: "model-a",
      componentType: "raw-material",
      componentId: "raw:fabric",
      componentName: "Quilt Fabric",
      unit: "m",
      quantityPerParent: 3,
      scrapPct: 0,
    },
  ];

  it("expands subassemblies with scrap factor and keeps availability null when unnetted", () => {
    const materials = unnettedMaterialBalances(
      [
        { id: "wire", name: "Spring Wire", unit: "kg" },
        { id: "fabric", name: "Quilt Fabric", unit: "m" },
      ],
      [],
    ).map((row) => ({
      ...row,
      // identity already prefixed by unnetted helper; remap to component ids used in BOM
      rawMaterialId: row.rawMaterialId.includes("wire") ? "raw:wire" : "raw:fabric",
      rawMaterialName: row.rawMaterialId.includes("wire") ? "Spring Wire" : "Quilt Fabric",
    }));

    const result = explodeMultiLevelMaterialRequirements([demand({ orderQuantity: 10 })], bom, materials);
    const byId = Object.fromEntries(result.requirements.map((r) => [r.rawMaterialId, r]));
    // wire: 10 parents * 1 sub * 2 kg * 1.10 scrap = 22
    expect(byId["raw:wire"]?.grossRequired).toBeCloseTo(22, 6);
    expect(byId["raw:fabric"]?.grossRequired).toBeCloseTo(30, 6);
    expect(byId["raw:wire"]?.availableQuantity).toBeNull();
    expect(byId["raw:wire"]?.shortageQuantity).toBeNull();
    expect(result.status).toBe("insufficient-data");
  });

  it("detects BOM cycles and withholds partial totals", () => {
    const cyclic: MrpMultiLevelBomLine[] = [
      {
        parentModelId: "model-a",
        componentType: "subassembly",
        componentId: "model-b",
        componentName: "B",
        unit: "unit",
        quantityPerParent: 1,
        scrapPct: 0,
      },
      {
        parentModelId: "model-b",
        componentType: "subassembly",
        componentId: "model-a",
        componentName: "A",
        unit: "unit",
        quantityPerParent: 1,
        scrapPct: 0,
      },
    ];
    const result = explodeMultiLevelMaterialRequirements([demand()], cyclic, []);
    expect(result.requirements).toEqual([]);
    expect(result.notes.some((n) => n.toLowerCase().includes("cycle"))).toBe(true);
    expect(result.status).toBe("insufficient-data");
  });

  it("fails closed when a demanded model has no BOM lines", () => {
    const result = explodeMultiLevelMaterialRequirements([demand()], [], []);
    expect(result.requirements).toEqual([]);
    expect(result.missingBomModels.length).toBeGreaterThan(0);
  });
});

describe("selectEffectiveReleasedBomRevisions", () => {
  it("selects the latest effective released revision and reports missing ones", () => {
    const selection = selectEffectiveReleasedBomRevisions(
      ["m1", "m2", "m3"],
      [
        { id: "r1", model_id: "m1", revision: "A", status: "released", effective_from: "2026-01-01", effective_to: null },
        { id: "r2", model_id: "m1", revision: "B", status: "released", effective_from: "2026-06-01", effective_to: null },
        { id: "r3", model_id: "m2", revision: "A", status: "draft", effective_from: "2026-01-01", effective_to: null },
        { id: "r4", model_id: "m2", revision: "B", status: "released", effective_from: "2027-01-01", effective_to: null },
      ],
      "2026-10-16",
    );
    expect(selection.selectedByModel.get("m1")?.id).toBe("r2");
    expect(selection.selectedByModel.has("m2")).toBe(false);
    expect(selection.missingEffectiveRevisionModelIds).toContain("m2");
    expect(selection.selectedByModel.has("m3")).toBe(false);
    expect(selection.missingEffectiveRevisionModelIds).not.toContain("m3");
  });
});

describe("grossQuantityPerFinishedUnit", () => {
  it("applies non-negative scrap percentage only", () => {
    expect(grossQuantityPerFinishedUnit(2, 10)).toBeCloseTo(2.2, 6);
    expect(grossQuantityPerFinishedUnit(2, -5)).toBeCloseTo(2, 6);
  });

  it("rejects non-positive quantity", () => {
    expect(() => grossQuantityPerFinishedUnit(0, 0)).toThrow(/positive/);
  });
});
