import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MRP_NETTING_BLOCKER, unnettedMaterialBalances } from "./mrp-availability";
import { explodeMaterialRequirements } from "./mrp-explosion";

describe("MRP availability fails closed", () => {
  it("ignores projection fields and keeps raw and stock identities distinct", () => {
    const raw = { id: "same", name: "Foam", unit: "sheet", current_stock: 999 };
    const stock = { ...raw, availableQuantity: 42 };
    expect(unnettedMaterialBalances([raw], [stock])).toEqual([
      { rawMaterialId: "raw:same", rawMaterialName: "Foam", unit: "sheet", availableQuantity: null },
      { rawMaterialId: "stock:same", rawMaterialName: "Foam", unit: "sheet", availableQuantity: null },
    ]);
  });

  it("preserves gross demand without inventing zero availability or shortages", () => {
    const result = explodeMaterialRequirements(
      [{ productionOrderId: "p", productionOrderNumber: "P-1", productModelId: "m", productModelName: "Classic", orderQuantity: 5 }],
      [{ productModelId: "m", rawMaterialId: "raw:r", rawMaterialName: "Foam", unit: "sheet", quantityPerFinishedUnit: 2 }],
      unnettedMaterialBalances([{ id: "r", name: "Foam", unit: "sheet" }], []),
    );
    expect(result.requirements[0]).toMatchObject({ grossRequired: 10, availableQuantity: null, shortageQuantity: null });
    expect(MRP_NETTING_BLOCKER).toContain("reservation history");
  });

  it("handles absent masters without inventing inventory", () => {
    expect(unnettedMaterialBalances([], [])).toEqual([]);
  });

  it("keeps the MRP route on the audited gate without unsafe availability reads", () => {
    const source = readFileSync(new URL("../routes/_app.mrp.tsx", import.meta.url), "utf8");
    expect(source).toContain("unnettedMaterialBalances(rawMaterials, stockItems)");
    expect(source).toContain("MRP_NETTING_BLOCKER");
    expect(source).not.toMatch(/current_stock|\.rpc\(\s*["']stock_(?:available|on_hand)/);
    expect(source).not.toMatch(/\.from\(\s*["'](?:stock_movements|stock_reservations|mrp_planned_orders)/);
  });
});