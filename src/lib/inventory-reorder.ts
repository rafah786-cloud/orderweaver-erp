/**
 * Reorder suggestion helper for operational inventory planning.
 * Callers must supply verified on-hand and on-order quantities.
 */

export type ReorderPolicy = "min_max" | "reorder_point";

export type ReorderItemInput = {
  itemId: string;
  itemName: string;
  unit: string;
  onHand: number;
  onOrder: number;
  /** Minimum stock level (min-max) or reorder point. */
  reorderLevel: number;
  /** Optional target / max level for min-max. */
  maxLevel?: number | null;
  /** Optional fixed reorder quantity when max is not used. */
  reorderQty?: number | null;
  policy?: ReorderPolicy;
};

export type ReorderSuggestion = {
  itemId: string;
  itemName: string;
  unit: string;
  onHand: number;
  onOrder: number;
  available: number;
  reorderLevel: number;
  suggestedOrderQty: number;
  reason: string;
};

export type ReorderResult = {
  suggestions: ReorderSuggestion[];
  skippedInvalid: number;
};

function finiteNonNeg(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

export function buildReorderSuggestions(items: ReorderItemInput[]): ReorderResult {
  const suggestions: ReorderSuggestion[] = [];
  let skippedInvalid = 0;

  for (const item of items) {
    if (
      !item.itemId ||
      !item.itemName?.trim() ||
      !item.unit?.trim() ||
      !finiteNonNeg(item.onHand) ||
      !finiteNonNeg(item.onOrder) ||
      !finiteNonNeg(item.reorderLevel)
    ) {
      skippedInvalid += 1;
      continue;
    }

    const available = item.onHand + item.onOrder;
    if (available >= item.reorderLevel) continue;

    const policy = item.policy ?? (item.maxLevel != null ? "min_max" : "reorder_point");
    let suggested = 0;
    let reason = "";

    if (policy === "min_max") {
      const maxLevel = item.maxLevel;
      if (maxLevel == null || !finiteNonNeg(maxLevel) || maxLevel < item.reorderLevel) {
        skippedInvalid += 1;
        continue;
      }
      suggested = Math.max(0, maxLevel - available);
      reason = `Available ${available} is below reorder level ${item.reorderLevel}; top up to max ${maxLevel}.`;
    } else {
      const qty = item.reorderQty;
      if (qty == null || !finiteNonNeg(qty) || qty <= 0) {
        skippedInvalid += 1;
        continue;
      }
      suggested = qty;
      reason = `Available ${available} is below reorder point ${item.reorderLevel}; suggest fixed order qty ${qty}.`;
    }

    if (suggested <= 0) continue;

    suggestions.push({
      itemId: item.itemId,
      itemName: item.itemName,
      unit: item.unit,
      onHand: item.onHand,
      onOrder: item.onOrder,
      available,
      reorderLevel: item.reorderLevel,
      suggestedOrderQty: Math.round((suggested + Number.EPSILON) * 1e6) / 1e6,
      reason,
    });
  }

  suggestions.sort((a, b) => a.itemName.localeCompare(b.itemName));
  return { suggestions, skippedInvalid };
}
