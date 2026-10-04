import { describe, expect, it } from "vitest";
import { IsolatedSalesAccountingChain } from "./accounting-sales-chain";

const invoice = {
  id: "inv-1001",
  invoiceNumber: "INV-1001",
  invoiceDate: "2026-04-01",
  partyLedgerId: "customer-ledger",
  salesLedgerId: "sales-ledger",
  totalAmount: 10000,
};

describe("canonical sales subledger → GL → receivable chain", () => {
  it("posts the sales invoice into GL and creates a linked receivable bill", async () => {
    const db = new IsolatedSalesAccountingChain();
    db.createInvoice(invoice);

    const voucher = await db.postInvoice(invoice.id);
    const bill = db.bills.get(`bill:${invoice.id}`);

    expect(voucher.lines).toEqual([
      { ledger_account_id: "customer-ledger", debit: 10000, credit: 0 },
      { ledger_account_id: "sales-ledger", debit: 0, credit: 10000 },
    ]);
    expect(bill).toMatchObject({
      sourceInvoiceId: invoice.id,
      originalAmount: 10000,
      sourceVoucherId: voucher.id,
      status: "open",
    });
    expect(db.outstanding(invoice.id)).toBe(10000);
    expect(db.getInvoice(invoice.id).status).toBe("posted");
  });

  it("records a bill-wise partial receipt and updates the receivable subledger", async () => {
    const db = new IsolatedSalesAccountingChain();
    db.createInvoice(invoice);
    await db.postInvoice(invoice.id);

    const result = await db.recordReceipt(invoice.id, 4000, "receipt:inv-1001:1");

    expect(result.outstanding).toBe(6000);
    expect(db.getInvoice(invoice.id)).toMatchObject({ status: "partial", paidAmount: 4000 });
    expect(db.bills.get(`bill:${invoice.id}`)?.allocations).toMatchObject([
      expect.objectContaining({ amount: 4000, effect: 1, allocationType: "against_ref" }),
    ]);
    expect(db.ledgerBalance("cash")).toBe(4000);
    expect(db.ledgerBalance("customer-ledger")).toBe(6000);
    expect(db.ledgerBalance("sales-ledger", "credit")).toBe(10000);
  });

  it("is idempotent and reaches fully paid state after the remaining receipt", async () => {
    const db = new IsolatedSalesAccountingChain();
    db.createInvoice(invoice);
    await db.postInvoice(invoice.id);

    const first = await db.recordReceipt(invoice.id, 4000, "receipt:inv-1001:1");
    const retry = await db.recordReceipt(invoice.id, 4000, "receipt:inv-1001:1");
    expect(retry.receipt.voucherId).toBe(first.receipt.voucherId);
    expect(db.bills.get(`bill:${invoice.id}`)?.allocations).toHaveLength(1);

    await db.recordReceipt(invoice.id, 6000, "receipt:inv-1001:2");
    expect(db.outstanding(invoice.id)).toBe(0);
    expect(db.getInvoice(invoice.id)).toMatchObject({ status: "paid", paidAmount: 10000 });
    expect(db.ledgerBalance("cash")).toBe(10000);
    expect(db.ledgerBalance("customer-ledger")).toBe(0);
    expect(db.ledgerBalance("sales-ledger", "credit")).toBe(10000);
  });

  it("rejects over-settlement and preserves the bill unchanged", async () => {
    const db = new IsolatedSalesAccountingChain();
    db.createInvoice(invoice);
    await db.postInvoice(invoice.id);

    await expect(db.recordReceipt(invoice.id, 10000.01, "receipt:inv-1001:bad")).rejects.toThrow("settlement exceeds outstanding");
    expect(db.outstanding(invoice.id)).toBe(10000);
    expect(db.bills.get(`bill:${invoice.id}`)?.allocations).toHaveLength(0);
  });

  it("reverses a receipt with a compensating GL entry and restores the bill allocation", async () => {
    const db = new IsolatedSalesAccountingChain();
    db.createInvoice(invoice);
    await db.postInvoice(invoice.id);
    const receipt = await db.recordReceipt(invoice.id, 10000, "receipt:inv-1001:1");

    const reversal = await db.reverseReceipt(receipt.receipt.id, "receipt-reversal:inv-1001:1");

    expect(reversal.reversalOf).toBe(receipt.receipt.voucherId);
    expect(db.outstanding(invoice.id)).toBe(10000);
    expect(db.getInvoice(invoice.id)).toMatchObject({ status: "posted", paidAmount: 0 });
    expect(db.ledgerBalance("cash")).toBe(0);
    expect(db.ledgerBalance("customer-ledger")).toBe(10000);
    expect(db.bills.get(`bill:${invoice.id}`)?.allocations).toMatchObject([
      expect.objectContaining({ effect: 1, amount: 10000 }),
      expect.objectContaining({ effect: -1, amount: 10000, allocationType: "reversal" }),
    ]);
  });

  it("refuses to reverse a still-settled invoice, then reverses the invoice after its receipt is reversed", async () => {
    const db = new IsolatedSalesAccountingChain();
    db.createInvoice(invoice);
    const source = await db.postInvoice(invoice.id);
    const receipt = await db.recordReceipt(invoice.id, 10000, "receipt:inv-1001:1");

    await expect(db.reverseInvoice(invoice.id)).rejects.toThrow("reverse receipts before invoice");
    expect(db.getInvoice(invoice.id).status).toBe("paid");

    await db.reverseReceipt(receipt.receipt.id, "receipt-reversal:inv-1001:1");
    const invoiceReversal = await db.reverseInvoice(invoice.id);

    expect(invoiceReversal.reversalOf).toBe(source.id);
    expect(db.getInvoice(invoice.id).status).toBe("cancelled");
    expect(db.bills.get(`bill:${invoice.id}`)?.status).toBe("cancelled");
    expect(db.outstanding(invoice.id)).toBe(10000);
    expect(db.ledgerBalance("cash")).toBe(0);
    expect(db.ledgerBalance("customer-ledger")).toBe(0);
    expect(db.ledgerBalance("sales-ledger", "credit")).toBe(0);
  });

  it("never mutates the invoice or GL on an invalid receipt", async () => {
    const db = new IsolatedSalesAccountingChain();
    db.createInvoice(invoice);
    const source = await db.postInvoice(invoice.id);
    const voucherCount = db.vouchers.length;

    await expect(db.recordReceipt(invoice.id, 10001, "receipt:inv-1001:invalid")).rejects.toThrow();

    expect(db.vouchers).toHaveLength(voucherCount);
    expect(db.getInvoice(invoice.id).sourceVoucherId).toBe(source.id);
    expect(db.outstanding(invoice.id)).toBe(10000);
  });
});
