import { describe, expect, it } from "vitest";
import { IsolatedPurchaseAccountingChain } from "./accounting-purchase-chain";

const purchase = {
  id: "pur-1001",
  billNumber: "PB-1001",
  billDate: "2026-04-01",
  supplierLedgerId: "supplier-ledger",
  purchaseLedgerId: "purchase-ledger",
  totalAmount: 10000,
};

describe("canonical purchase subledger → GL → payable chain", () => {
  it("posts the purchase bill into GL and creates a linked payable bill", async () => {
    const db = new IsolatedPurchaseAccountingChain();
    db.createPurchase(purchase);

    const voucher = await db.postPurchase(purchase.id);
    const bill = db.bills.get(`payable:${purchase.id}`);

    expect(voucher.lines).toEqual([
      { ledger_account_id: "purchase-ledger", debit: 10000, credit: 0 },
      { ledger_account_id: "supplier-ledger", debit: 0, credit: 10000 },
    ]);
    expect(bill).toMatchObject({
      sourcePurchaseId: purchase.id,
      originalAmount: 10000,
      sourceVoucherId: voucher.id,
      status: "open",
    });
    expect(db.outstanding(purchase.id)).toBe(10000);
    expect(db.getPurchase(purchase.id).status).toBe("posted");
  });

  it("records a partial payment and reduces the supplier payable", async () => {
    const db = new IsolatedPurchaseAccountingChain();
    db.createPurchase(purchase);
    await db.postPurchase(purchase.id);

    const result = await db.recordPayment(purchase.id, 4000, "payment:pur-1001:1");

    expect(result.outstanding).toBe(6000);
    expect(db.getPurchase(purchase.id)).toMatchObject({ status: "partial", paidAmount: 4000 });
    expect(db.bills.get(`payable:${purchase.id}`)?.allocations).toMatchObject([
      expect.objectContaining({ amount: 4000, effect: 1, allocationType: "against_ref" }),
    ]);
    expect(db.ledgerBalance("cash")).toBe(-4000);
    expect(db.ledgerBalance("supplier-ledger")).toBe(6000);
    expect(db.ledgerBalance("purchase-ledger")).toBe(10000);
  });

  it("is idempotent and reaches fully paid state after the remaining payment", async () => {
    const db = new IsolatedPurchaseAccountingChain();
    db.createPurchase(purchase);
    await db.postPurchase(purchase.id);

    const first = await db.recordPayment(purchase.id, 4000, "payment:pur-1001:1");
    const retry = await db.recordPayment(purchase.id, 4000, "payment:pur-1001:1");
    expect(retry.payment.voucherId).toBe(first.payment.voucherId);
    expect(db.bills.get(`payable:${purchase.id}`)?.allocations).toHaveLength(1);

    await db.recordPayment(purchase.id, 6000, "payment:pur-1001:2");
    expect(db.outstanding(purchase.id)).toBe(0);
    expect(db.getPurchase(purchase.id)).toMatchObject({ status: "paid", paidAmount: 10000 });
    expect(db.ledgerBalance("cash")).toBe(-10000);
    expect(db.ledgerBalance("supplier-ledger")).toBe(0);
    expect(db.ledgerBalance("purchase-ledger")).toBe(10000);
  });

  it("rejects over-settlement without changing the payable", async () => {
    const db = new IsolatedPurchaseAccountingChain();
    db.createPurchase(purchase);
    await db.postPurchase(purchase.id);

    await expect(db.recordPayment(purchase.id, 10000.01, "payment:pur-1001:bad")).rejects.toThrow("settlement exceeds outstanding");
    expect(db.outstanding(purchase.id)).toBe(10000);
    expect(db.bills.get(`payable:${purchase.id}`)?.allocations).toHaveLength(0);
  });

  it("reverses a payment with a compensating GL entry and restores the payable", async () => {
    const db = new IsolatedPurchaseAccountingChain();
    db.createPurchase(purchase);
    await db.postPurchase(purchase.id);
    const payment = await db.recordPayment(purchase.id, 10000, "payment:pur-1001:1");

    const reversal = await db.reversePayment(payment.payment.id, "payment-reversal:pur-1001:1");

    expect(reversal.reversalOf).toBe(payment.payment.voucherId);
    expect(db.outstanding(purchase.id)).toBe(10000);
    expect(db.getPurchase(purchase.id)).toMatchObject({ status: "posted", paidAmount: 0 });
    expect(db.ledgerBalance("cash")).toBe(0);
    expect(db.ledgerBalance("supplier-ledger")).toBe(10000);
    expect(db.bills.get(`payable:${purchase.id}`)?.allocations).toMatchObject([
      expect.objectContaining({ effect: 1, amount: 10000 }),
      expect.objectContaining({ effect: -1, amount: 10000, allocationType: "reversal" }),
    ]);
  });

  it("refuses to reverse a still-paid purchase, then reverses it after payment reversal", async () => {
    const db = new IsolatedPurchaseAccountingChain();
    db.createPurchase(purchase);
    const source = await db.postPurchase(purchase.id);
    const payment = await db.recordPayment(purchase.id, 10000, "payment:pur-1001:1");

    await expect(db.reversePurchase(purchase.id)).rejects.toThrow("reverse payments before purchase");
    expect(db.getPurchase(purchase.id).status).toBe("paid");

    await db.reversePayment(payment.payment.id, "payment-reversal:pur-1001:1");
    const purchaseReversal = await db.reversePurchase(purchase.id);

    expect(purchaseReversal.reversalOf).toBe(source.id);
    expect(db.getPurchase(purchase.id).status).toBe("cancelled");
    expect(db.bills.get(`payable:${purchase.id}`)?.status).toBe("cancelled");
    expect(db.outstanding(purchase.id)).toBe(10000);
    expect(db.ledgerBalance("cash")).toBe(0);
    expect(db.ledgerBalance("supplier-ledger")).toBe(0);
    expect(db.ledgerBalance("purchase-ledger")).toBe(0);
  });

  it("never mutates the purchase or GL on an invalid payment", async () => {
    const db = new IsolatedPurchaseAccountingChain();
    db.createPurchase(purchase);
    const source = await db.postPurchase(purchase.id);
    const voucherCount = db.vouchers.length;

    await expect(db.recordPayment(purchase.id, 10001, "payment:pur-1001:invalid")).rejects.toThrow();

    expect(db.vouchers).toHaveLength(voucherCount);
    expect(db.getPurchase(purchase.id).sourceVoucherId).toBe(source.id);
    expect(db.outstanding(purchase.id)).toBe(10000);
  });
});
