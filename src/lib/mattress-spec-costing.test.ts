import { describe, expect, it } from "vitest";
import { costMattressSpecification } from "./ai/mattress-spec-costing.server";

function fakeDb(dataset: Record<string, any[]>) {
  const db = {
    rpc: async () => ({ data: "company-1", error: null }),
    from(table: string) {
      const state = { data: dataset[table] ?? [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        limit: () => query,
        not: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(state).then(resolve),
      };
      return query;
    },
  };
  return db as any;
}

describe("reverse mattress specification costing", () => {
  it("uses ERP purchase rates and applies the fixed internal pricing policy without exposing calculations", async () => {
    const db = fakeDb({
      raw_materials: [
        { id: "foam-1", code: "F20", name: "20D Foam Sheet", unit: "sheet" },
        { id: "fabric-1", code: "KF", name: "Knitted Fabric", unit: "metre" },
      ],
      stock_items: [],
      purchase_bill_items: [
        { raw_material_id: "foam-1", quantity: 10, unit_price: 100, purchase_bills: { bill_date: "2026-09-01" } },
        { raw_material_id: "fabric-1", quantity: 20, unit_price: 50, purchase_bills: { bill_date: "2026-09-01" } },
      ],
    });
    const result = await costMattressSpecification(db, [
      { materialName: "20D Foam Sheet", quantity: 2, unit: "sheet" },
      { materialName: "Knitted Fabric", quantity: 4, unit: "metre" },
    ]);
    expect(result.status).toBe("calculated");
    expect(result.estimatedPrice).toBe(550);
    expect(JSON.stringify(result)).not.toMatch(/10%|20%|labour percentage|profit margin percentage/i);
  });

  it("refuses to estimate when a material or compatible ERP rate is missing", async () => {
    const result = await costMattressSpecification(fakeDb({
      raw_materials: [{ id: "foam-1", code: "F20", name: "20D Foam Sheet", unit: "sheet" }],
      stock_items: [],
      purchase_bill_items: [],
    }), [{ materialName: "20D Foam Sheet", quantity: 2, unit: "sheet" }]);
    expect(result.status).toBe("insufficient-data");
    expect(result.estimatedPrice).toBeNull();
    expect(result.missingMaterials.length).toBeGreaterThan(0);
  });

  it("refuses ambiguous material matches instead of guessing", async () => {
    const result = await costMattressSpecification(fakeDb({
      raw_materials: [
        { id: "foam-1", code: "F20", name: "20D Foam Sheet", unit: "sheet" },
        { id: "foam-2", code: "F20B", name: "20D Foam Sheet Roll", unit: "sheet" },
      ],
      stock_items: [],
      purchase_bill_items: [
        { raw_material_id: "foam-1", quantity: 10, unit_price: 100, purchase_bills: { bill_date: "2026-09-01" } },
        { raw_material_id: "foam-2", quantity: 10, unit_price: 110, purchase_bills: { bill_date: "2026-09-01" } },
      ],
    }), [{ materialName: "20D Foam", quantity: 2, unit: "sheet" }]);
    expect(result.status).toBe("insufficient-data");
    expect(result.estimatedPrice).toBeNull();
  });
});
