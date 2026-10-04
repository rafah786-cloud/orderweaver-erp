import type { VoucherFixture } from "./accounting-foundation";
import { IsolatedAccountingFixture, validateGlLines } from "./accounting-foundation";

export type PurchaseChainStatus = "draft" | "posted" | "partial" | "paid" | "cancelled";

type BillAllocation = {
  id: string;
  billId: string;
  settlementVoucherId: string;
  amount: number;
  effect: 1 | -1;
  allocationType: "against_ref" | "reversal";
  idempotencyKey: string;
};

type PayableBill = {
  id: string;
  sourcePurchaseId: string;
  originalAmount: number;
  sourceVoucherId: string;
  sourceVoucherEntryId: string;
  status: "open" | "cancelled";
  allocations: BillAllocation[];
};

type PurchaseBill = {
  id: string;
  billNumber: string;
  billDate: string;
  supplierLedgerId: string;
  purchaseLedgerId: string;
  totalAmount: number;
  paidAmount: number;
  status: PurchaseChainStatus;
  sourceVoucherId: string | null;
  payableBillId: string | null;
};

type Payment = {
  id: string;
  purchaseId: string;
  amount: number;
  voucherId: string;
  reversalVoucherId: string | null;
};

/**
 * Pure in-memory fixture for the canonical purchase accounting chain.
 * It never connects to Supabase and never mutates production data.
 */
export class IsolatedPurchaseAccountingChain {
  readonly gl = new IsolatedAccountingFixture();
  readonly purchases = new Map<string, PurchaseBill>();
  readonly bills = new Map<string, PayableBill>();
  readonly payments = new Map<string, Payment>();
  readonly vouchers: VoucherFixture[] = [];

  createPurchase(input: {
    id: string;
    billNumber: string;
    billDate: string;
    supplierLedgerId: string;
    purchaseLedgerId: string;
    totalAmount: number;
  }) {
    if (input.totalAmount <= 0) throw new Error("purchase amount must be positive");
    if (this.purchases.has(input.id)) throw new Error("purchase already exists");
    const purchase: PurchaseBill = {
      ...input,
      paidAmount: 0,
      status: "draft",
      sourceVoucherId: null,
      payableBillId: null,
    };
    this.purchases.set(input.id, purchase);
    return purchase;
  }

  async postPurchase(purchaseId: string) {
    const purchase = this.requirePurchase(purchaseId);
    if (purchase.status === "cancelled") throw new Error("purchase cancelled");
    if (purchase.sourceVoucherId) return this.requireVoucher(purchase.sourceVoucherId);

    const entries = [
      { ledger_account_id: purchase.purchaseLedgerId, debit: purchase.totalAmount, credit: 0 },
      { ledger_account_id: purchase.supplierLedgerId, debit: 0, credit: purchase.totalAmount },
    ];
    if (!validateGlLines(entries).valid) throw new Error("unbalanced purchase voucher");

    const voucher = await this.gl.post("purchase", purchase.billDate, entries, `purchase:${purchase.id}`);
    this.vouchers.push(voucher);

    const supplierEntry = voucher.lines.find(
      (line) => line.ledger_account_id === purchase.supplierLedgerId && line.credit > 0,
    );
    if (!supplierEntry) throw new Error("purchase voucher has no supplier payable entry");

    const bill: PayableBill = {
      id: `payable:${purchase.id}`,
      sourcePurchaseId: purchase.id,
      originalAmount: purchase.totalAmount,
      sourceVoucherId: voucher.id,
      sourceVoucherEntryId: `${voucher.id}:supplier`,
      status: "open",
      allocations: [],
    };
    this.bills.set(bill.id, bill);
    purchase.sourceVoucherId = voucher.id;
    purchase.payableBillId = bill.id;
    purchase.status = "posted";
    return voucher;
  }

  outstanding(purchaseId: string) {
    const purchase = this.requirePurchase(purchaseId);
    if (!purchase.payableBillId) return purchase.totalAmount;
    const bill = this.bills.get(purchase.payableBillId);
    if (!bill) throw new Error("payable bill missing");
    const allocated = bill.allocations.reduce((sum, row) => sum + row.effect * row.amount, 0);
    return roundMoney(bill.originalAmount - allocated);
  }

  async recordPayment(purchaseId: string, amount: number, idempotencyKey: string, date = "2026-04-02") {
    const purchase = this.requirePurchase(purchaseId);
    if (purchase.status === "cancelled") throw new Error("purchase cancelled");
    if (!purchase.sourceVoucherId || !purchase.payableBillId) throw new Error("purchase must be posted before payment");
    if (amount <= 0) throw new Error("payment amount must be positive");
    if (idempotencyKey.trim().length < 8) throw new Error("idempotency key required");

    const existing = this.payments.get(idempotencyKey);
    if (existing) return { payment: existing, outstanding: this.outstanding(purchaseId) };

    const due = this.outstanding(purchaseId);
    if (amount > due + 0.01) throw new Error("settlement exceeds outstanding");

    const voucher = await this.gl.post(
      "payment",
      date,
      [
        { ledger_account_id: purchase.supplierLedgerId, debit: amount, credit: 0 },
        { ledger_account_id: "cash", debit: 0, credit: amount },
      ],
      idempotencyKey,
    );
    this.vouchers.push(voucher);

    const bill = this.bills.get(purchase.payableBillId);
    if (!bill) throw new Error("payable bill missing");
    bill.allocations.push({
      id: `allocation:${idempotencyKey}`,
      billId: bill.id,
      settlementVoucherId: voucher.id,
      amount,
      effect: 1,
      allocationType: "against_ref",
      idempotencyKey,
    });

    const payment: Payment = { id: idempotencyKey, purchaseId, amount, voucherId: voucher.id, reversalVoucherId: null };
    this.payments.set(idempotencyKey, payment);
    this.refreshPurchaseStatus(purchase);
    return { payment, outstanding: this.outstanding(purchaseId) };
  }

  async reversePayment(idempotencyKey: string, reversalKey: string, date = "2026-04-03") {
    const payment = this.payments.get(idempotencyKey);
    if (!payment) throw new Error("payment not found");
    if (payment.reversalVoucherId) return this.requireVoucher(payment.reversalVoucherId);
    if (reversalKey.trim().length < 8) throw new Error("idempotency key required");

    const reversal = await this.gl.reverse(payment.voucherId, date);
    this.vouchers.push(reversal);

    const purchase = this.requirePurchase(payment.purchaseId);
    const bill = purchase.payableBillId ? this.bills.get(purchase.payableBillId) : undefined;
    if (!bill) throw new Error("payable bill missing");
    bill.allocations.push({
      id: `allocation:${reversalKey}`,
      billId: bill.id,
      settlementVoucherId: reversal.id,
      amount: payment.amount,
      effect: -1,
      allocationType: "reversal",
      idempotencyKey: reversalKey,
    });
    payment.reversalVoucherId = reversal.id;
    this.refreshPurchaseStatus(purchase);
    return reversal;
  }

  async reversePurchase(purchaseId: string, date = "2026-04-04") {
    const purchase = this.requirePurchase(purchaseId);
    if (purchase.status === "cancelled") throw new Error("purchase already cancelled");
    if (!purchase.sourceVoucherId || !purchase.payableBillId) throw new Error("purchase has no source voucher");
    if (Math.abs(this.outstanding(purchaseId) - purchase.totalAmount) > 0.01) {
      throw new Error("reverse payments before purchase");
    }

    const reversal = await this.gl.reverse(purchase.sourceVoucherId, date);
    this.vouchers.push(reversal);
    const bill = this.bills.get(purchase.payableBillId);
    if (!bill) throw new Error("payable bill missing");
    bill.status = "cancelled";
    purchase.status = "cancelled";
    purchase.paidAmount = 0;
    return reversal;
  }

  ledgerBalance(ledgerId: string) {
    return roundMoney(this.vouchers.reduce((sum, voucher) => {
      if (voucher.status !== "posted" && voucher.status !== "reversed") return sum;
      return sum + voucher.lines.reduce((lineSum, line) => lineSum + (line.ledger_account_id === ledgerId ? line.debit - line.credit : 0), 0);
    }, 0));
  }

  getPurchase(purchaseId: string) {
    return this.requirePurchase(purchaseId);
  }

  private refreshPurchaseStatus(purchase: PurchaseBill) {
    const due = this.outstanding(purchase.id);
    purchase.paidAmount = roundMoney(purchase.totalAmount - due);
    purchase.status = due <= 0.01 ? "paid" : purchase.paidAmount > 0 ? "partial" : "posted";
  }

  private requirePurchase(purchaseId: string) {
    const purchase = this.purchases.get(purchaseId);
    if (!purchase) throw new Error("purchase missing");
    return purchase;
  }

  private requireVoucher(voucherId: string) {
    const voucher = this.vouchers.find((row) => row.id === voucherId);
    if (!voucher) throw new Error("voucher missing");
    return voucher;
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
