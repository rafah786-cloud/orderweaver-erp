import { describe, expect, it } from "vitest";
import { explodeMaterialRequirements } from "./mrp-explosion";

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
