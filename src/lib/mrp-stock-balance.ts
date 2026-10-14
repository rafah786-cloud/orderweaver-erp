import type { MrpMaterialBalance } from "./mrp-explosion";

export interface MrpStockMaterialMaster {
  id: string;
  name: string;
  unit: string;
}
export interface MrpStockItemMaster {
  id: string;
  name: string;
  unit: string;
  mappedRawMaterialId: string | null;
}
export interface MrpStockMovementRow {
  stockItemId: string;
  movementType: string;
  quantity: number;
  postingId: string | null;
  reversesPostingId: string | null;
}
export interface MrpStockReservationRow {
  stockItemId: string;
  quantity: number;
  status: string;
}
export interface MrpVerifiedBalanceInput {
  rawMaterials: MrpStockMaterialMaster[];
  stockItems: MrpStockItemMaster[];
  movements: MrpStockMovementRow[];
  reservations: MrpStockReservationRow[];
  /** Both sides of any posting identified as reversed; treat related balances as unknown. */
  reversedPostingIds?: ReadonlySet<string>;
}
export interface MrpVerifiedBalanceResult {
  balances: MrpMaterialBalance[];
  invalidMaterialBalances: string[];
  notes: string[];
}

const INBOUND = new Set(["purchase", "production_in", "transfer_in", "opening"]);
const OUTBOUND = new Set(["sale", "production_out", "transfer_out"]);

/**
 * Derives planning-only availability from stock movements and open reservations.
 * Deliberately fails closed for ambiguous adjustments/reversals, missing ledger
 * history, unit mismatches, invalid rows and negative on-hand. No unit conversion.
 */
export function buildVerifiedMrpMaterialBalances(input: MrpVerifiedBalanceInput): MrpVerifiedBalanceResult {
  const invalid = new Set<string>();
  const movementByItem = new Map<string, MrpStockMovementRow[]>();
  for (const movement of input.movements) {
    const rows = movementByItem.get(movement.stockItemId) ?? [];
    rows.push(movement);
    movementByItem.set(movement.stockItemId, rows);
  }
  const reservationsByItem = new Map<string, MrpStockReservationRow[]>();
  for (const reservation of input.reservations) {
    if (reservation.status !== "open") continue;
    const rows = reservationsByItem.get(reservation.stockItemId) ?? [];
    rows.push(reservation);
    reservationsByItem.set(reservation.stockItemId, rows);
  }

  const stockMasterById = new Map<string, MrpStockItemMaster>();
  for (const item of input.stockItems) {
    if (!item.id || !item.name.trim() || !item.unit.trim() || stockMasterById.has(item.id)) {
      invalid.add(item.name || item.id || "Unknown stock item");
      continue;
    }
    stockMasterById.set(item.id, item);
  }

  const balanceByStockItem = new Map<string, number | null>();
  for (const item of input.stockItems) {
    const rows = movementByItem.get(item.id) ?? [];
    const reservations = reservationsByItem.get(item.id) ?? [];
    let invalidReason: string | null = null;

    if (!rows.length) invalidReason = "no verified movement history";
    let onHand = 0;
    if (!invalidReason) {
      for (const row of rows) {
        if (!Number.isFinite(row.quantity) || row.quantity < 0) {
          invalidReason = "invalid movement quantity";
          break;
        }
        if (
          row.reversesPostingId !== null ||
          (row.postingId !== null && (input.reversedPostingIds?.has(row.postingId) ?? false))
        ) {
          invalidReason = "reversed posting requires reconciliation";
          break;
        }
        if (row.movementType === "adjustment") {
          invalidReason = "adjustment direction is ambiguous";
          break;
        }
        if (INBOUND.has(row.movementType)) onHand += row.quantity;
        else if (OUTBOUND.has(row.movementType)) onHand -= row.quantity;
        else {
          invalidReason = "unsupported movement type";
          break;
        }
        if (!Number.isFinite(onHand)) {
          invalidReason = "movement arithmetic overflow";
          break;
        }
      }
    }

    let reserved = 0;
    if (!invalidReason) {
      for (const row of reservations) {
        if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
          invalidReason = "invalid open reservation";
          break;
        }
        reserved += row.quantity;
        if (!Number.isFinite(reserved)) {
          invalidReason = "reservation arithmetic overflow";
          break;
        }
      }
    }

    const available = onHand - reserved;
    if (!invalidReason && (!Number.isFinite(available) || available < 0)) {
      invalidReason = "negative or non-finite available quantity";
    }
    if (invalidReason) {
      balanceByStockItem.set(item.id, null);
      invalid.add(item.name + " (" + invalidReason + ")");
    } else {
      balanceByStockItem.set(item.id, available);
    }
  }

  const balances: MrpMaterialBalance[] = [];
  for (const item of input.stockItems) {
    balances.push({
      rawMaterialId: "stock:" + item.id,
      rawMaterialName: item.name,
      unit: item.unit,
      availableQuantity: balanceByStockItem.get(item.id) ?? null,
    });
  }

  for (const material of input.rawMaterials) {
    const mappedItems = input.stockItems.filter((item) => item.mappedRawMaterialId === material.id);
    let availableQuantity: number | null = null;

    if (mappedItems.length && material.unit.trim()) {
      const unitMatches = mappedItems.every((item) =>
        item.unit.trim().toLowerCase() === material.unit.trim().toLowerCase()
      );
      const quantities = mappedItems.map((item) => balanceByStockItem.get(item.id));
      if (unitMatches && quantities.every((value): value is number => value !== null && value !== undefined)) {
        const total = quantities.reduce((sum, value) => sum + value, 0);
        if (Number.isFinite(total) && total >= 0) availableQuantity = total;
        else invalid.add(material.name + " (invalid aggregated available quantity)");
      } else if (!unitMatches) {
        invalid.add(material.name + " (stock item unit does not match raw-material unit)");
      }
    }

    balances.push({
      rawMaterialId: "raw:" + material.id,
      rawMaterialName: material.name,
      unit: material.unit,
      availableQuantity,
    });
  }

  return {
    balances,
    invalidMaterialBalances: [...invalid].sort(),
    notes: [
      "Availability is derived from company-scoped stock movements minus open reservations; it is planning-only and does not reserve or post stock.",
      "Stock without ledger history, with ambiguous adjustments/reversals, invalid quantities or incompatible unit mappings is left unknown instead of guessing.",
      "Unit conversions, incoming purchase supply, production WIP, safety stock and dated availability are not included.",
    ],
  };
}
