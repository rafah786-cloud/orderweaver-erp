import { describe, expect, it } from "vitest";
import { IsolatedStockLedger, planPurchaseReceipt, planSalesDispatch } from "./inventory-ledger";

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

  it("allows only one concurrent issue to consume the same quantity", async () => {
    const db = new IsolatedStockLedger([]);
    await db.receive("foam", "main", 1, 10, "receipt-4");
    const results = await Promise.allSettled([db.issue("foam", "main", 1, "issue-a"), db.issue("foam", "main", 1, "issue-b")]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((row) => row.status === "rejected")).toHaveLength(1);
  });
});

describe("purchase and sales stock plans", () => {
  it("creates no receipt for a draft and one receipt when received", () => {
    expect(planPurchaseReceipt("draft", [{ id: "line-1", quantity: 2, rate: 5 }])).toEqual([]);
    const received = planPurchaseReceipt("received", [{ id: "line-1", quantity: 2, rate: 5 }]);
    expect(received).toHaveLength(1);
    expect(planPurchaseReceipt("received", [{ id: "line-1", quantity: 2, rate: 5 }])[0].key).toBe(received[0].key);
  });

  it("does not reserve a sales order and rejects a repeated or unrated dispatch", () => {
    expect(planSalesDispatch({ orderId: "so-1", ordered: 2, available: 5, ratedQuantity: 5, alreadyDispatched: false })).toMatchObject({ reserved: 0, key: "dispatch:so-1" });
    expect(planSalesDispatch({ orderId: "so-1", ordered: 2, available: 1, ratedQuantity: 5, alreadyDispatched: false }).reason).toBe("insufficient stock");
    expect(planSalesDispatch({ orderId: "so-1", ordered: 2, available: 5, ratedQuantity: 0, alreadyDispatched: false }).reason).toBe("opening stock has no rate");
    expect(planSalesDispatch({ orderId: "so-1", ordered: 2, available: 5, ratedQuantity: 5, alreadyDispatched: true }).reason).toBe("already dispatched");
  });
});
