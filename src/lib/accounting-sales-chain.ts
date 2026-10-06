import type { VoucherFixture } from "./accounting-foundation";
import { IsolatedAccountingFixture, prepareInvoiceVoucher } from "./accounting-foundation";

export type SalesChainStatus = "draft" | "posted" | "partial" | "paid" | "cancelled";

type BillAllocation = {
  id: string;
  billId: string;
  settlementVoucherId: string;
  amount: number;
  effect: 1 | -1;
  allocationType: "against_ref" | "reversal";
  idempotencyKey: string;
};

type Bill = {
  id: string;
  sourceInvoiceId: string;
  originalAmount: number;
  sourceVoucherId: string;
  sourceVoucherEntryId: string;
  status: "open" | "cancelled";
  allocations: BillAllocation[];
};

type SalesInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  partyLedgerId: string;
  salesLedgerId: string;
  totalAmount: number;
  paidAmount: number;
  status: SalesChainStatus;
  sourceVoucherId: string | null;
  billId: string | null;
};

type Receipt = {
  id: string;
  invoiceId: string;
  amount: number;
  voucherId: string;
  reversalVoucherId: string | null;
};

/**
 * Pure in-memory fixture for the canonical sales accounting chain.
 * It never connects to Supabase and never mutates production data.
 */
export class IsolatedSalesAccountingChain {
  readonly gl = new IsolatedAccountingFixture();
  readonly invoices = new Map<string, SalesInvoice>();
  readonly bills = new Map<string, Bill>();
  readonly receipts = new Map<string, Receipt>();
  readonly vouchers: VoucherFixture[] = [];

  createInvoice(input: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    partyLedgerId: string;
    salesLedgerId: string;
    totalAmount: number;
  }) {
    if (input.totalAmount <= 0) throw new Error("invoice amount must be positive");
    if (this.invoices.has(input.id)) throw new Error("invoice already exists");
    const invoice: SalesInvoice = {
      ...input,
      paidAmount: 0,
      status: "draft",
      sourceVoucherId: null,
      billId: null,
    };
    this.invoices.set(input.id, invoice);
    return invoice;
  }

  async postInvoice(invoiceId: string) {
    const invoice = this.requireInvoice(invoiceId);
    if (invoice.status === "cancelled") throw new Error("invoice cancelled");
    if (invoice.sourceVoucherId) return this.requireVoucher(invoice.sourceVoucherId);

    const prepared = prepareInvoiceVoucher({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      partyLedgerId: invoice.partyLedgerId,
      salesLedgerId: invoice.salesLedgerId,
      subtotal: invoice.totalAmount,
      taxAmount: 0,
    });
    if (!prepared.ok) throw new Error(prepared.reason);

    const voucher = await this.gl.post(
      "sales",
      prepared.call.date,
      prepared.call.entries,
      prepared.key,
    );
    this.vouchers.push(voucher);

    const partyEntry = voucher.lines.find(
      (line) => line.ledger_account_id === invoice.partyLedgerId && line.debit > 0,
    );
    if (!partyEntry) throw new Error("sales voucher has no customer receivable entry");

    const bill: Bill = {
      id: `bill:${invoice.id}`,
      sourceInvoiceId: invoice.id,
      originalAmount: invoice.totalAmount,
      sourceVoucherId: voucher.id,
      sourceVoucherEntryId: `${voucher.id}:party`,
      status: "open",
      allocations: [],
    };
    this.bills.set(bill.id, bill);
    invoice.sourceVoucherId = voucher.id;
    invoice.billId = bill.id;
    invoice.status = "posted";
    return voucher;
  }

  outstanding(invoiceId: string) {
    const invoice = this.requireInvoice(invoiceId);
    if (!invoice.billId) return invoice.totalAmount;
    const bill = this.bills.get(invoice.billId);
    if (!bill) throw new Error("receivable bill missing");
    const allocated = bill.allocations.reduce((sum, row) => sum + row.effect * row.amount, 0);
    return roundMoney(bill.originalAmount - allocated);
  }

  async recordReceipt(
    invoiceId: string,
    amount: number,
    idempotencyKey: string,
    date = "2026-04-02",
  ) {
    const invoice = this.requireInvoice(invoiceId);
    if (invoice.status === "cancelled") throw new Error("invoice cancelled");
    if (!invoice.sourceVoucherId || !invoice.billId)
      throw new Error("invoice must be posted before receipt");
    if (amount <= 0) throw new Error("receipt amount must be positive");
    if (idempotencyKey.trim().length < 8) throw new Error("idempotency key required");

    const existing = this.receipts.get(idempotencyKey);
    if (existing) return { receipt: existing, outstanding: this.outstanding(invoiceId) };

    const due = this.outstanding(invoiceId);
    if (amount > due) throw new Error("settlement exceeds outstanding");

    const voucher = await this.gl.post(
      "receipt",
      date,
      [
        { ledger_account_id: "cash", debit: amount, credit: 0 },
        { ledger_account_id: invoice.partyLedgerId, debit: 0, credit: amount },
      ],
      idempotencyKey,
    );
    this.vouchers.push(voucher);

    const bill = this.bills.get(invoice.billId);
    if (!bill) throw new Error("receivable bill missing");
    bill.allocations.push({
      id: `allocation:${idempotencyKey}`,
      billId: bill.id,
      settlementVoucherId: voucher.id,
      amount,
      effect: 1,
      allocationType: "against_ref",
      idempotencyKey,
    });

    const receipt: Receipt = {
      id: idempotencyKey,
      invoiceId,
      amount,
      voucherId: voucher.id,
      reversalVoucherId: null,
    };
    this.receipts.set(idempotencyKey, receipt);
    this.refreshInvoiceStatus(invoice);
    return { receipt, outstanding: this.outstanding(invoiceId) };
  }

  async reverseReceipt(idempotencyKey: string, reversalKey: string, date = "2026-04-03") {
    const receipt = this.receipts.get(idempotencyKey);
    if (!receipt) throw new Error("receipt not found");
    if (receipt.reversalVoucherId) return this.requireVoucher(receipt.reversalVoucherId);
    if (reversalKey.trim().length < 8) throw new Error("idempotency key required");

    const reversal = await this.gl.reverse(receipt.voucherId, date);
    this.vouchers.push(reversal);

    const invoice = this.requireInvoice(receipt.invoiceId);
    const bill = invoice.billId ? this.bills.get(invoice.billId) : undefined;
    if (!bill) throw new Error("receivable bill missing");
    bill.allocations.push({
      id: `allocation:${reversalKey}`,
      billId: bill.id,
      settlementVoucherId: reversal.id,
      amount: receipt.amount,
      effect: -1,
      allocationType: "reversal",
      idempotencyKey: reversalKey,
    });
    receipt.reversalVoucherId = reversal.id;
    this.refreshInvoiceStatus(invoice);
    return reversal;
  }

  async reverseInvoice(invoiceId: string, date = "2026-04-04") {
    const invoice = this.requireInvoice(invoiceId);
    if (invoice.status === "cancelled") throw new Error("invoice already cancelled");
    if (!invoice.sourceVoucherId || !invoice.billId)
      throw new Error("invoice has no source voucher");
    if (Math.abs(this.outstanding(invoiceId) - invoice.totalAmount) > 0.01) {
      throw new Error("reverse receipts before invoice");
    }

    const reversal = await this.gl.reverse(invoice.sourceVoucherId, date);
    this.vouchers.push(reversal);
    const bill = this.bills.get(invoice.billId);
    if (!bill) throw new Error("receivable bill missing");
    bill.status = "cancelled";
    invoice.status = "cancelled";
    invoice.paidAmount = 0;
    return reversal;
  }

  ledgerBalance(ledgerId: string, normalBalance: "debit" | "credit" = "debit") {
    const signedBalance = this.vouchers.reduce((sum, voucher) => {
      if (voucher.status !== "posted" && voucher.status !== "reversed") return sum;
      return (
        sum +
        voucher.lines.reduce(
          (lineSum, line) =>
            lineSum + (line.ledger_account_id === ledgerId ? line.debit - line.credit : 0),
          0,
        )
      );
    }, 0);
    return roundMoney(normalBalance === "debit" ? signedBalance : -signedBalance);
  }

  getInvoice(invoiceId: string) {
    return this.requireInvoice(invoiceId);
  }

  private refreshInvoiceStatus(invoice: SalesInvoice) {
    const due = this.outstanding(invoice.id);
    invoice.paidAmount = roundMoney(invoice.totalAmount - due);
    invoice.status = due <= 0.01 ? "paid" : invoice.paidAmount > 0 ? "partial" : "posted";
  }

  private requireInvoice(invoiceId: string) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error("invoice missing");
    return invoice;
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
