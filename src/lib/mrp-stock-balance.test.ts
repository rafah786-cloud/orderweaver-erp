import { describe, expect, it } from "vitest";
import { buildVerifiedMrpMaterialBalances } from "./mrp-stock-balance";

const material = (overrides: Partial<{ id: string; name: string; unit: string }> = {}) => ({
  id: "foam-raw",
  name: "Foam",
  unit: "kg",
  ...overrides,
});
const stock = (overrides: Partial<{ id: string; name: string; unit: string; mappedRawMaterialId: string | null }> = {}) => ({
  id: "foam-stock",
  name: "Foam stock",
  unit: "kg",
  mappedRawMaterialId: "foam-raw",
  ...overrides,
});
const movement = (overrides: Partial<{ stockItemId: string; movementType: string; quantity: number; postingId: string | null; reversesPostingId: string | null }> = {}) => ({
  stockItemId: "foam-stock",
  movementType: "purchase",
  quantity: 10,
  postingId: null,
  reversesPostingId: null,
  ...overrides,
});
const reservation = (overrides: Partial<{ stockItemId: string; quantity: number; status: string }> = {}) => ({
  stockItemId: "foam-stock",
  quantity: 2,
  status: "open",
  ...overrides,
});

describe("verified MRP material availability", () => {
  it("applies canonical movement signs and subtracts only open reservations", () => {
    const result = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()],
      stockItems: [stock()],
      movements: [
        movement({ movementType: "purchase", quantity: 10 }),
        movement({ movementType: "sale", quantity: 3 }),
        movement({ movementType: "transfer_out", quantity: 1 }),
      ],
      reservations: [reservation({ quantity: 2 }), reservation({ quantity: 99, status: "released" })],
    });
    expect(result.balances.find((row) => row.rawMaterialId === "stock:foam-stock")?.availableQuantity).toBe(4);
    expect(result.balances.find((row) => row.rawMaterialId === "raw:foam-raw")?.availableQuantity).toBe(4);
  });

  it("does not treat missing ledger history as verified zero stock", () => {
    const result = buildVerifiedMrpMaterialBalances({ rawMaterials: [material()], stockItems: [stock()], movements: [], reservations: [] });
    expect(result.balances.every((row) => row.availableQuantity === null)).toBe(true);
  });

  it("fails closed on ambiguous adjustments and reversed postings", () => {
    const adjustment = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()], stockItems: [stock()],
      movements: [movement({ movementType: "adjustment", quantity: 5 })], reservations: [],
    });
    expect(adjustment.balances.every((row) => row.availableQuantity === null)).toBe(true);
    expect(adjustment.invalidMaterialBalances.join(" ")).toMatch(/adjustment direction is ambiguous/);

    const reversal = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()], stockItems: [stock()],
      movements: [movement({ postingId: "reversing-posting" })], reservations: [],
      reversedPostingIds: new Set(["reversing-posting"]),
    });
    expect(reversal.balances.every((row) => row.availableQuantity === null)).toBe(true);
  });

  it("rejects unsupported movement types, negative quantities and negative available stock", () => {
    const unknownType = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()], stockItems: [stock()],
      movements: [movement({ movementType: "mystery" })], reservations: [],
    });
    expect(unknownType.balances[0].availableQuantity).toBeNull();

    const negativeMove = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()], stockItems: [stock()],
      movements: [movement({ quantity: -2 })], reservations: [],
    });
    expect(negativeMove.balances[0].availableQuantity).toBeNull();

    const negativeOnHand = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()], stockItems: [stock()],
      movements: [movement({ movementType: "sale", quantity: 5 })], reservations: [],
    });
    expect(negativeOnHand.balances[0].availableQuantity).toBeNull();
  });

  it("does not convert units when mapping stock items to raw materials", () => {
    const result = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material({ unit: "kg" })],
      stockItems: [stock({ unit: "roll" })],
      movements: [movement()],
      reservations: [],
    });
    expect(result.balances.find((row) => row.rawMaterialId === "stock:foam-stock")?.availableQuantity).toBe(10);
    expect(result.balances.find((row) => row.rawMaterialId === "raw:foam-raw")?.availableQuantity).toBeNull();
    expect(result.invalidMaterialBalances.join(" ")).toMatch(/stock item unit does not match/);
  });

  it("aggregates same-unit stock-item mappings and marks the material unknown if any mapping is unverified", () => {
    const valid = stock({ id: "foam-stock-2", name: "Foam stock 2" });
    const result = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()],
      stockItems: [stock(), valid],
      movements: [
        movement({ quantity: 5 }),
        movement({ stockItemId: "foam-stock-2", quantity: 7 }),
      ],
      reservations: [],
    });
    expect(result.balances.find((row) => row.rawMaterialId === "raw:foam-raw")?.availableQuantity).toBe(12);

    const incomplete = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()],
      stockItems: [stock(), valid],
      movements: [movement({ quantity: 5 })],
      reservations: [],
    });
    expect(incomplete.balances.find((row) => row.rawMaterialId === "raw:foam-raw")?.availableQuantity).toBeNull();
  });

  it("rejects invalid open reservations and conflicting stock master IDs", () => {
    const invalidReservation = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()], stockItems: [stock()],
      movements: [movement()], reservations: [reservation({ quantity: Number.NaN })],
    });
    expect(invalidReservation.balances[0].availableQuantity).toBeNull();

    const duplicateMaster = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()], stockItems: [stock(), stock({ name: "Conflicting duplicate" })],
      movements: [movement()], reservations: [],
    });
    expect(duplicateMaster.balances[0].availableQuantity).toBeNull();
  });

  it("keeps no-mapping raw materials unknown", () => {
    const result = buildVerifiedMrpMaterialBalances({
      rawMaterials: [material()],
      stockItems: [stock({ mappedRawMaterialId: null })],
      movements: [movement()],
      reservations: [],
    });
    expect(result.balances.find((row) => row.rawMaterialId === "raw:foam-raw")?.availableQuantity).toBeNull();
  });
});
