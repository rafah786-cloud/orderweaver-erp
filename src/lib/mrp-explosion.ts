export interface MrpDemandLine {
  productionOrderId: string;
  productionOrderNumber: string;
  productModelId: string;
  productModelName: string;
  orderQuantity: number;
}
export interface MrpBomLine {
  productModelId: string;
  rawMaterialId: string;
  rawMaterialName: string;
  unit: string;
  quantityPerFinishedUnit: number;
}
export interface MrpMaterialBalance {
  rawMaterialId: string;
  rawMaterialName: string;
  unit: string;
  availableQuantity?: number | null;
}
export interface MrpRequirement {
  rawMaterialId: string;
  rawMaterialName: string;
  unit: string;
  grossRequired: number;
  availableQuantity: number | null;
  shortageQuantity: number | null;
  sourceOrders: Array<{
    productionOrderId: string;
    productionOrderNumber: string;
    productModelId: string;
    productModelName: string;
    finishedQuantity: number;
    requiredQuantity: number;
  }>;
}
export interface MrpResult {
  status: "calculated" | "insufficient-data";
  requirements: MrpRequirement[];
  missingBomModels: string[];
  missingMaterialMasters: string[];
  invalidMaterialBalances: string[];
  notes: string[];
}

/** Read-only, single-level BOM explosion. It never reserves or posts stock. */
export function explodeMaterialRequirements(
  demand: MrpDemandLine[],
  bom: MrpBomLine[],
  materials: MrpMaterialBalance[],
): MrpResult {
  const notes = [
    "Single-level BOM only; subassemblies are not expanded.",
    "Gross requirements exclude reservations, open supply, lead times and capacity.",
    "No inventory reservation or purchasing/production document is created.",
  ];
  const emptyResult = (
    missingBomModels: string[] = [],
    missingMaterialMasters: string[] = [],
    invalidMaterialBalances: string[] = [],
    extraNotes: string[] = [],
  ): MrpResult => ({
    status: "insufficient-data",
    requirements: [],
    missingBomModels,
    missingMaterialMasters,
    invalidMaterialBalances,
    notes: [...notes, ...extraNotes],
  });

  const invalidDemand = demand.some((row) =>
    !row.productionOrderId ||
    !row.productionOrderNumber.trim() ||
    !row.productModelId ||
    !row.productModelName.trim() ||
    !Number.isFinite(row.orderQuantity) ||
    row.orderQuantity <= 0
  );
  const invalidBom = bom.some((row) =>
    !row.productModelId ||
    !row.rawMaterialId ||
    !row.rawMaterialName.trim() ||
    !row.unit.trim() ||
    !Number.isFinite(row.quantityPerFinishedUnit) ||
    row.quantityPerFinishedUnit <= 0
  );
  if (invalidDemand || invalidBom) {
    return emptyResult([], [], [], [
      "Demand/BOM identities, units and quantities must be valid and positive.",
    ]);
  }

  const byModel = new Map<string, MrpBomLine[]>();
  for (const line of bom) {
    const rows = byModel.get(line.productModelId) ?? [];
    rows.push(line);
    byModel.set(line.productModelId, rows);
  }
  const demandedModelIds = [...new Set(demand.map((row) => row.productModelId))];
  const missingBomModels = demandedModelIds
    .filter((id) => !byModel.get(id)?.length)
    .map((id) => demand.find((row) => row.productModelId === id)?.productModelName ?? id);

  const masterById = new Map<string, MrpMaterialBalance>();
  const conflictingMasters = new Set<string>();
  for (const material of materials) {
    if (!material.rawMaterialId || !material.rawMaterialName.trim() || !material.unit.trim()) continue;
    const existing = masterById.get(material.rawMaterialId);
    if (!existing) {
      masterById.set(material.rawMaterialId, material);
    } else if (
      existing.unit.trim().toLowerCase() !== material.unit.trim().toLowerCase() ||
      existing.availableQuantity !== material.availableQuantity ||
      existing.rawMaterialName !== material.rawMaterialName
    ) {
      conflictingMasters.add(material.rawMaterialId);
    }
  }

  const totals = new Map<string, MrpRequirement>();
  const missing = new Set<string>();
  const invalidBalances = new Set<string>();
  let arithmeticOverflow = false;

  for (const demandLine of demand) {
    for (const bomLine of byModel.get(demandLine.productModelId) ?? []) {
      const material = masterById.get(bomLine.rawMaterialId);
      if (!material || conflictingMasters.has(bomLine.rawMaterialId)) {
        missing.add(bomLine.rawMaterialName + " (missing or conflicting material master)");
        continue;
      }
      if (material.unit.trim().toLowerCase() !== bomLine.unit.trim().toLowerCase()) {
        missing.add(
          bomLine.rawMaterialName +
            " (BOM unit " + bomLine.unit + "; master unit " + material.unit + ")",
        );
        continue;
      }
      const available = material.availableQuantity;
      if (available != null && (!Number.isFinite(available) || available < 0)) {
        invalidBalances.add(material.rawMaterialName);
      }

      const requiredQuantity = demandLine.orderQuantity * bomLine.quantityPerFinishedUnit;
      if (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0) {
        arithmeticOverflow = true;
        continue;
      }
      const source = {
        productionOrderId: demandLine.productionOrderId,
        productionOrderNumber: demandLine.productionOrderNumber,
        productModelId: demandLine.productModelId,
        productModelName: demandLine.productModelName,
        finishedQuantity: demandLine.orderQuantity,
        requiredQuantity,
      };
      const existing = totals.get(bomLine.rawMaterialId);
      if (existing) {
        existing.grossRequired += requiredQuantity;
        existing.sourceOrders.push(source);
        if (!Number.isFinite(existing.grossRequired)) arithmeticOverflow = true;
      } else {
        totals.set(bomLine.rawMaterialId, {
          rawMaterialId: bomLine.rawMaterialId,
          rawMaterialName: material.rawMaterialName,
          unit: material.unit,
          grossRequired: requiredQuantity,
          availableQuantity:
            available != null && Number.isFinite(available) && available >= 0 ? available : null,
          shortageQuantity: null,
          sourceOrders: [source],
        });
      }
    }
  }

  if (arithmeticOverflow) {
    return emptyResult(missingBomModels, [...missing].sort(), [...invalidBalances].sort(), [
      "Requirement arithmetic exceeded a finite numeric range; no partial totals are presented.",
    ]);
  }

  const requirements = [...totals.values()]
    .map((row) => {
      const grossRequired = Math.round((row.grossRequired + Number.EPSILON) * 1e6) / 1e6;
      const shortageQuantity =
        row.availableQuantity == null
          ? null
          : Math.round((Math.max(0, grossRequired - row.availableQuantity) + Number.EPSILON) * 1e6) / 1e6;
      return { ...row, grossRequired, shortageQuantity };
    })
    .sort((a, b) => a.rawMaterialName.localeCompare(b.rawMaterialName));

  if (missingBomModels.length) notes.push("Some demanded models have no BOM; their material needs are excluded.");
  if (missing.size) notes.push("Some BOM materials are missing or use incompatible units; affected needs are excluded.");
  if (invalidBalances.size) notes.push("Some material balances are negative or non-finite and cannot be used for shortage calculation.");
  if (requirements.some((row) => row.availableQuantity == null)) {
    notes.push("Availability is unknown for some materials; shortages are not calculated for those rows.");
  }

  return {
    status:
      missingBomModels.length || missing.size || invalidBalances.size || !requirements.length || requirements.some((row) => row.availableQuantity == null)
        ? "insufficient-data"
        : "calculated",
    requirements,
    missingBomModels,
    missingMaterialMasters: [...missing].sort(),
    invalidMaterialBalances: [...invalidBalances].sort(),
    notes,
  };
}
