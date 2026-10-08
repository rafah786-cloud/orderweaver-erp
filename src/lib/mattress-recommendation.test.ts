import { describe, expect, it } from "vitest";
import { mattressBudgetRecommendations } from "./ai/mattress-recommendation.server";

function fakeDb(dataset: Record<string, unknown[]>) {
  const db = {
    from(table: string) {
      const state = { data: dataset[table] ?? [], error: null };
      const query = {
        select: () => query,
        gt: () => query,
        lte: () => query,
        order: () => query,
        limit: () => query,
        in: () => query,
        not: () => query,
        gte: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(state).then(resolve),
      };
      return query;
    },
  };
  return db as any;
}

const models = Array.from({ length: 6 }, (_, i) => ({
  id: `model-${i + 1}`,
  code: `M${i + 1}`,
  name: `Mattress ${i + 1}`,
  size: "78 x 60",
  thickness: `${5 + i}"`,
  cover_fabric: "Knitted fabric",
  foam_density: `${20 + i}D`,
  default_price: 8200 + i * 250,
  extra_specs: { profile: i % 2 ? "comfort" : "support" },
}));

const materials = models.map((_, i) => ({
  id: `rm-${i + 1}`,
  code: `RM${i + 1}`,
  name: i % 2 ? `${i + 1}" Foam ${20 + i}D` : "Coir Sheet",
  unit: "pcs",
  current_stock: 100,
}));

const bom = models.map((m, i) => ({
  model_id: m.id,
  raw_material_id: materials[i].id,
  quantity_per_unit: 2 + i * 0.1,
}));

const purchaseLines = materials.map((m, i) => ({
  raw_material_id: m.id,
  quantity: 100,
  unit_price: 700 + i * 25,
  purchase_bills: { bill_date: "2026-09-01" },
}));

describe("mattress budget recommendations", () => {
  it("returns at least five real ERP models when five defensible candidates exist", async () => {
    const result = await mattressBudgetRecommendations(
      fakeDb({
        product_models: models,
        raw_materials: materials,
        model_boq: bom,
        stock_items: [],
        purchase_bill_items: purchaseLines,
      }),
      { budget: 10000, limit: 5, preferInStock: true },
    );

    expect(result.candidates).toHaveLength(5);
    expect(result.dataSufficientForFive).toBe(true);
    expect(result.candidates.every((c) => c.defaultPrice <= 10000)).toBe(true);
    expect(result.candidates.every((c) => c.materialCostComplete)).toBe(true);
    expect(result.candidates.every((c) => c.stockReady)).toBe(true);
    expect(result.candidates.every((c) => c.components.length > 0)).toBe(true);
  });

  it("never invents a fifth recommendation when ERP data is insufficient", async () => {
    const result = await mattressBudgetRecommendations(
      fakeDb({
        product_models: models.slice(0, 3),
        raw_materials: materials.slice(0, 3),
        model_boq: bom.slice(0, 3),
        stock_items: [],
        purchase_bill_items: purchaseLines.slice(0, 3),
      }),
      { budget: 10000 },
    );

    expect(result.candidates).toHaveLength(3);
    expect(result.dataSufficientForFive).toBe(false);
    expect(result.limitations.some((x) => x.includes("does not support five"))).toBe(true);
  });

  it("uses recorded purchase rates and stock readiness instead of invented costs", async () => {
    const result = await mattressBudgetRecommendations(
      fakeDb({
        product_models: models.slice(0, 1),
        raw_materials: materials.slice(0, 1).map((m) => ({ ...m, current_stock: 1 })),
        model_boq: bom.slice(0, 1),
        stock_items: [],
        purchase_bill_items: purchaseLines.slice(0, 1),
      }),
      { budget: 10000 },
    );

    expect(result.candidates[0]?.estimatedMaterialCost).toBeGreaterThan(0);
    expect(result.candidates[0]?.costBasis).toBe("weighted_purchase_rate_365d");
    expect(result.candidates[0]?.stockReady).toBe(false);
  });
});
