import { describe, expect, it } from "vitest";
import {
  IsolatedStockLedger,
  planPurchaseReceipt,
  planSalesDispatch,
  applyDocumentTransition,
  planProduction,
  planFinishedGoodsReceipt,
} from "./inventory-ledger";

const opening = [{ itemId: "foam", godownId: "main", quantity: 10 }];

describe("stock movements", () => {
  it("receives stock without changing opening rows", async () => {
    const db = new IsolatedStockLedger(opening);
    const row = await db.receive("foam", "main", 5, 20, "receipt-1");
    expect(row.amount).toBe(100);
    expect(db.openingUntouched()).toBe(true);
  });
  it("rejects an issue when quantity or opening rate is missing", async () => {
    const db = new IsolatedStockLedger(opening);
    await expect(db.issue("foam", "main", 1, "issue-opening")).rejects.toThrow("no rate");
    await db.receive("foam", "main", 2, 10, "receipt-2");
    await expect(db.issue("foam", "main", 20, "issue-too-much")).rejects.toThrow("insufficient");
  });
  it("issues, transfers, reverses, and ignores a duplicate key", async () => {
    const db = new IsolatedStockLedger([]);
    await db.receive("foam", "main", 4, 10, "receipt-3");
    const issue = await db.issue("foam", "main", 1, "issue-1");
    expect(await db.issue("foam", "main", 1, "issue-1")).toBe(issue);
    const transfer = await db.transfer("foam", "main", "branch", 1, "transfer-1");
    expect(transfer).toHaveLength(2);
    const reversal = await db.reverse(issue.id, "reverse-1");
    expect(reversal.reverses).toBe(issue.id);
    expect(db.openingUntouched()).toBe(true);
  });
  it("uses signed on-hand value for running weighted average after issues", async () => {
    const db = new IsolatedStockLedger([]);
    await db.receive("foam", "main", 4, 10, "receipt-avg-a");
    await db.receive("foam", "main", 2, 20, "receipt-avg-b");
    const first = await db.issue("foam", "main", 3, "issue-avg-a");
    expect(first.rate).toBeCloseTo(13.3333333333, 10);
    const second = await db.issue("foam", "main", 1, "issue-avg-b");
    expect(second.rate).toBeCloseTo(13.3333333333, 10);
    expect(db.available("foam", "main")).toBe(2);
    expect(db.weightedRate("foam", "main")).toBeCloseTo(13.3333333333, 10);
  });
  it("preserves weighted value across a transfer and values the destination", async () => {
    const db = new IsolatedStockLedger([]);
    await db.receive("foam", "main", 4, 10, "receipt-5a");
    await db.receive("foam", "main", 2, 20, "receipt-5b");
    const [out, incoming] = await db.transfer("foam", "main", "branch", 3, "transfer-valued");
    expect(out.rate).toBeCloseTo(13.333333333333334, 12);
    expect(out.amount).toBeCloseTo(40, 8);
    expect(incoming.rate).toBe(out.rate);
    expect(incoming.amount).toBeCloseTo(out.amount, 8);
    expect(db.available("foam", "branch")).toBe(3);
    expect(db.weightedRate("foam", "branch")).toBeCloseTo(out.rate, 12);
  });
  it("allows only one concurrent issue to consume the same quantity", async () => {
    const db = new IsolatedStockLedger([]);
    await db.receive("foam", "main", 1, 10, "receipt-4");
    const results = await Promise.allSettled([
      db.issue("foam", "main", 1, "issue-a"),
      db.issue("foam", "main", 1, "issue-b"),
    ]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((row) => row.status === "rejected")).toHaveLength(1);
  });
});

describe("document and production planning", () => {
  it("creates no receipt for a draft and one receipt when received", () => {
    expect(planPurchaseReceipt("draft", [{ id: "line-1", quantity: 2, rate: 5 }])).toEqual([]);
    const received = planPurchaseReceipt("received", [{ id: "line-1", quantity: 2, rate: 5 }]);
    expect(received).toHaveLength(1);
    expect(planPurchaseReceipt("received", [{ id: "line-1", quantity: 2, rate: 5 }])[0].key).toBe(
      received[0].key,
    );
  });
  it("keeps sales dispatch idempotent and blocks unrated/insufficient stock", () => {
    expect(
      planSalesDispatch({
        orderId: "so-1",
        ordered: 2,
        available: 5,
        ratedQuantity: 5,
        alreadyDispatched: false,
      }),
    ).toMatchObject({ reserved: 0, key: "dispatch:so-1" });
    expect(
      planSalesDispatch({
        orderId: "so-1",
        ordered: 2,
        available: 1,
        ratedQuantity: 5,
        alreadyDispatched: false,
      }).reason,
    ).toBe("insufficient stock");
    expect(
      planSalesDispatch({
        orderId: "so-1",
        ordered: 2,
        available: 5,
        ratedQuantity: 0,
        alreadyDispatched: false,
      }).reason,
    ).toBe("opening stock has no rate");
  });
  it("plans production consumption from BOM quantities", () => {
    const rows = planProduction(
      "so-1",
      [{ id: "line-1", modelId: "model-a", quantity: 3 }],
      [
        { modelId: "model-a", rawMaterialId: "foam", quantityPerUnit: 2 },
        { modelId: "model-a", rawMaterialId: "wire", quantityPerUnit: 4 },
      ],
      new Map([
        ["foam", "item-foam"],
        ["wire", "item-wire"],
      ]),
    );
    expect(rows).toEqual([
      { key: "bom:so-1:line-1:foam", stockItemId: "item-foam", quantity: 6 },
      { key: "bom:so-1:line-1:wire", stockItemId: "item-wire", quantity: 12 },
    ]);
  });
  it("blocks production when a BOM quantity or stock mapping is invalid", () => {
    expect(() =>
      planProduction(
        "so-1",
        [{ id: "line-1", modelId: "model-a", quantity: 1 }],
        [{ modelId: "model-a", rawMaterialId: "foam", quantityPerUnit: 0 }],
        new Map(),
      ),
    ).toThrow("invalid BOM quantity");
    expect(() =>
      planProduction(
        "so-1",
        [{ id: "line-1", modelId: "model-a", quantity: 1 }],
        [{ modelId: "model-a", rawMaterialId: "foam", quantityPerUnit: 1 }],
        new Map(),
      ),
    ).toThrow("no stock item mapped");
  });
  it("plans finished goods only when mapped and valued", () => {
    const lines = [{ id: "line-1", modelId: "model-a", quantity: 2 }];
    const valued = new Map([["model-a", { stockItemId: "fg-a", rate: 1500 }]]);
    expect(planFinishedGoodsReceipt("so-1", lines, valued).at(0)).toMatchObject({
      key: "fg:so-1:line-1",
      stockItemId: "fg-a",
      quantity: 2,
      rate: 1500,
    });
    expect(() => planFinishedGoodsReceipt("so-1", lines, new Map())).toThrow(
      "no stock item mapping",
    );
    expect(() =>
      planFinishedGoodsReceipt(
        "so-1",
        lines,
        new Map([["model-a", { stockItemId: "fg-a", rate: 0 }]]),
      ),
    ).toThrow("no valuation rate");
  });
  it("does not post duplicate document transitions", () => {
    const line = [{ id: "line-1", matches: ["item-1"] }];
    expect(applyDocumentTransition("purchase", "draft", "received", line).movements).toHaveLength(
      1,
    );
    expect(applyDocumentTransition("purchase", "received", "received", line).movements).toEqual([]);
    expect(
      applyDocumentTransition("sales", "confirmed", "dispatched", line).movements,
    ).toHaveLength(1);
    expect(applyDocumentTransition("sales", "dispatched", "dispatched", line).movements).toEqual(
      [],
    );
  });
});
