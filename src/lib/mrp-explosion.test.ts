import { describe, expect, it } from "vitest";
import { explodeMaterialRequirements, explodeMultiLevelMaterialRequirements, type MrpDemandLine, type MrpMaterialBalance, type MrpMultiLevelBomLine } from "./mrp-explosion";

const demand = (overrides: Partial<{
  productionOrderId: string;
  productionOrderNumber: string;
  productModelId: string;
  productModelName: string;
  orderQuantity: number;
}> = {}) => ({
  productionOrderId: "p1",
  productionOrderNumber: "PO-1",
  productModelId: "m1",
  productModelName: "Classic",
  orderQuantity: 5,
  ...overrides,
});

const bomLine = (overrides: Partial<{
  productModelId: string;
  rawMaterialId: string;
  rawMaterialName: string;
  unit: string;
  quantityPerFinishedUnit: number;
}> = {}) => ({
  productModelId: "m1",
  rawMaterialId: "r1",
  rawMaterialName: "Foam",
  unit: "sheet",
  quantityPerFinishedUnit: 2,
  ...overrides,
});

const balance = (overrides: Partial<{
  rawMaterialId: string;
  rawMaterialName: string;
  unit: string;
  availableQuantity?: number | null;
}> = {}) => ({
  rawMaterialId: "r1",
  rawMaterialName: "Foam",
  unit: "sheet",
  availableQuantity: 6,
  ...overrides,
});

describe("MRP explosion", () => {
  it("aggregates gross requirements and calculates shortages", () => {
    const result = explodeMaterialRequirements([demand()], [bomLine()], [balance()]);
    expect(result.status).toBe("calculated");
    expect(result.requirements[0]).toMatchObject({ grossRequired: 10, shortageQuantity: 4 });
  });

  it("aggregates demand across production orders without losing source references", () => {
    const result = explodeMaterialRequirements(
      [demand(), demand({ productionOrderId: "p2", productionOrderNumber: "PO-2", orderQuantity: 3 })],
      [bomLine()],
      [balance({ availableQuantity: 0 })],
    );
    expect(result.requirements[0].grossRequired).toBe(16);
    expect(result.requirements[0].shortageQuantity).toBe(16);
    expect(result.requirements[0].sourceOrders).toHaveLength(2);
  });

  it("fails closed when a demanded model has no BOM", () => {
    const result = explodeMaterialRequirements([demand()], [], [balance()]);
    expect(result.status).toBe("insufficient-data");
    expect(result.missingBomModels).toContain("Classic");
    expect(result.requirements).toEqual([]);
  });

  it("excludes BOM lines with unit mismatch instead of applying guessed conversions", () => {
    const result = explodeMaterialRequirements(
      [demand()],
      [bomLine({ unit: "kg" })],
      [balance({ unit: "sheet" })],
    );
    expect(result.status).toBe("insufficient-data");
    expect(result.requirements).toEqual([]);
    expect(result.missingMaterialMasters.join(" ")).toMatch(/BOM unit kg; master unit sheet/);
  });

  it("marks negative or non-finite balances as invalid and never reports a shortage from them", () => {
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = explodeMaterialRequirements([demand()], [bomLine()], [balance({ availableQuantity: invalid })]);
      expect(result.status).toBe("insufficient-data");
      expect(result.invalidMaterialBalances).toContain("Foam");
      expect(result.requirements[0].availableQuantity).toBeNull();
      expect(result.requirements[0].shortageQuantity).toBeNull();
    }
  });

  it("fails closed when duplicate material masters conflict", () => {
    const result = explodeMaterialRequirements(
      [demand()],
      [bomLine()],
      [balance(), balance({ unit: "kg", availableQuantity: 100 })],
    );
    expect(result.status).toBe("insufficient-data");
    expect(result.requirements).toEqual([]);
    expect(result.missingMaterialMasters.join(" ")).toMatch(/conflicting material master/);
  });

  it("rejects invalid demand and BOM quantities", () => {
    expect(explodeMaterialRequirements([demand({ orderQuantity: 0 })], [bomLine()], [balance()]).status).toBe("insufficient-data");
    expect(explodeMaterialRequirements([demand()], [bomLine({ quantityPerFinishedUnit: -1 })], [balance()]).status).toBe("insufficient-data");
  });

  it("fails closed on arithmetic overflow rather than showing partial or infinite totals", () => {
    const result = explodeMaterialRequirements(
      [demand({ orderQuantity: Number.MAX_VALUE })],
      [bomLine({ quantityPerFinishedUnit: 2 })],
      [balance()],
    );
    expect(result.status).toBe("insufficient-data");
    expect(result.requirements).toEqual([]);
    expect(result.notes.join(" ")).toMatch(/finite numeric range/);
  });

  it("does not invent availability when no verified balance is supplied", () => {
    const result = explodeMaterialRequirements([demand()], [bomLine()], [balance({ availableQuantity: null })]);
    expect(result.status).toBe("insufficient-data");
    expect(result.requirements[0]).toMatchObject({ availableQuantity: null, shortageQuantity: null });
  });
});


describe("multi-level MRP explosion", () => {
  const multiDemand = (overrides: Partial<MrpDemandLine> = {}): MrpDemandLine => ({
    productionOrderId: "p1",
    productionOrderNumber: "PO-1",
    productModelId: "mattress",
    productModelName: "Classic Mattress",
    orderQuantity: 4,
    ...overrides,
  });
  const multiLine = (overrides: Partial<MrpMultiLevelBomLine> = {}): MrpMultiLevelBomLine => ({
    parentModelId: "mattress",
    componentType: "raw-material",
    componentId: "raw:foam",
    componentName: "Foam",
    unit: "sheet",
    quantityPerParent: 3,
    scrapPct: 0,
    ...overrides,
  });
  const multiBalance = (overrides: Partial<MrpMaterialBalance> = {}): MrpMaterialBalance => ({
    rawMaterialId: "raw:foam",
    rawMaterialName: "Foam",
    unit: "sheet",
    availableQuantity: 100,
    ...overrides,
  });

  it("explodes subassemblies recursively and applies scrap at each BOM level", () => {
    const result = explodeMultiLevelMaterialRequirements(
      [multiDemand()],
      [
        multiLine({ componentType: "subassembly", componentId: "spring-unit", componentName: "Spring Unit", unit: "unit", quantityPerParent: 2, scrapPct: 10 }),
        multiLine({ parentModelId: "spring-unit", quantityPerParent: 3, scrapPct: 5 }),
      ],
      [multiBalance()],
    );
    expect(result.status).toBe("calculated");
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].grossRequired).toBeCloseTo(27.72);
    expect(result.requirements[0].shortageQuantity).toBe(0);
    expect(result.requirements[0].sourceOrders[0].finishedQuantity).toBe(4);
    expect(result.requirements[0].sourceOrders[0].requiredQuantity).toBeCloseTo(27.72);
  });

  it("aggregates shared leaf components across direct and nested BOM paths", () => {
    const result = explodeMultiLevelMaterialRequirements(
      [multiDemand()],
      [
        multiLine({ quantityPerParent: 1 }),
        multiLine({ componentType: "subassembly", componentId: "quilt-pack", componentName: "Quilt Pack", unit: "unit", quantityPerParent: 2 }),
        multiLine({ parentModelId: "quilt-pack", quantityPerParent: 3 }),
      ],
      [multiBalance({ availableQuantity: 0 })],
    );
    expect(result.requirements[0].grossRequired).toBe(28);
    expect(result.requirements[0].shortageQuantity).toBe(28);
    expect(result.requirements[0].sourceOrders).toHaveLength(2);
  });

  it("fails closed on missing subassembly BOMs", () => {
    const result = explodeMultiLevelMaterialRequirements(
      [multiDemand()],
      [multiLine({ componentType: "subassembly", componentId: "missing-model", componentName: "Missing Model", unit: "unit", quantityPerParent: 1 })],
      [multiBalance()],
    );
    expect(result.status).toBe("insufficient-data");
    expect(result.missingBomModels).toContain("Missing Model");
    expect(result.requirements).toEqual([]);
  });

  it("detects cyclic BOMs and withholds partial totals", () => {
    const result = explodeMultiLevelMaterialRequirements(
      [multiDemand()],
      [
        multiLine({ componentType: "subassembly", componentId: "spring-unit", componentName: "Spring Unit", unit: "unit", quantityPerParent: 1 }),
        multiLine({ parentModelId: "spring-unit", componentType: "subassembly", componentId: "mattress", componentName: "Classic Mattress", unit: "unit", quantityPerParent: 1 }),
      ],
      [multiBalance()],
    );
    expect(result.status).toBe("insufficient-data");
    expect(result.requirements).toEqual([]);
    expect(result.notes.join(" ")).toMatch(/cycle or excessive nesting/);
  });

  it("does not net inventory across mismatched units or invent unknown availability", () => {
    const mismatch = explodeMultiLevelMaterialRequirements(
      [multiDemand()],
      [multiLine({ unit: "roll" })],
      [multiBalance({ unit: "sheet" })],
    );
    expect(mismatch.status).toBe("insufficient-data");
    expect(mismatch.missingMaterialMasters[0]).toMatch(/BOM unit roll; master unit sheet/);

    const unknown = explodeMultiLevelMaterialRequirements(
      [multiDemand()],
      [multiLine()],
      [multiBalance({ availableQuantity: null })],
    );
    expect(unknown.status).toBe("insufficient-data");
    expect(unknown.requirements[0].availableQuantity).toBeNull();
    expect(unknown.requirements[0].shortageQuantity).toBeNull();
  });

  it("rejects invalid BOM quantities and prevents numeric overflow", () => {
    expect(explodeMultiLevelMaterialRequirements([multiDemand()], [multiLine({ quantityPerParent: 0 })], [multiBalance()]).requirements).toEqual([]);
    const overflow = explodeMultiLevelMaterialRequirements(
      [multiDemand({ orderQuantity: Number.MAX_VALUE })],
      [multiLine({ quantityPerParent: Number.MAX_VALUE })],
      [multiBalance()],
    );
    expect(overflow.status).toBe("insufficient-data");
    expect(overflow.requirements).toEqual([]);
    expect(overflow.notes.join(" ")).toMatch(/numeric limits/);
  });
});
