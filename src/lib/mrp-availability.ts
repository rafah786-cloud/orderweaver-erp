import type { MrpMaterialBalance } from "./mrp-explosion";

/** Audited contract gap; never substitute a mutable stock projection. */
export const MRP_NETTING_BLOCKER =
  "Netting unavailable: no verified company-scoped as-of stock balance with reservation history and confirmed open supply.";

type MaterialMaster = { id: string; name: string; unit: string };

/** Accept master identity only; extra stock fields cannot become availability. */
export function unnettedMaterialBalances(
  rawMaterials: MaterialMaster[],
  stockItems: MaterialMaster[],
): MrpMaterialBalance[] {
  return [
    ...rawMaterials.map((material) => ({
      rawMaterialId: `raw:${material.id}`,
      rawMaterialName: material.name,
      unit: material.unit,
      availableQuantity: null,
    })),
    ...stockItems.map((material) => ({
      rawMaterialId: `stock:${material.id}`,
      rawMaterialName: material.name,
      unit: material.unit,
      availableQuantity: null,
    })),
  ];
}