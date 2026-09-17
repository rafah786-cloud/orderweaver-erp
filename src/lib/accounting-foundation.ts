import type { VoucherType } from "./accounting";

export type VoucherStatus = "draft" | "posted" | "cancelled" | "reversed";
export type GlLineInput = { ledger_account_id: string; debit: number; credit: number };
export type VoucherFixture = {
  id: string;
  type: VoucherType;
  date: string;
  status: VoucherStatus;
  number: number;
  idempotencyKey: string;
  lines: GlLineInput[];
  reversalOf?: string;
};

export function validateGlLines(lines: GlLineInput[]) {
  if (lines.length < 2) return { valid: false, difference: 0 };
  if (lines.some((line) => line.debit < 0 || line.credit < 0 || (line.debit > 0) === (line.credit > 0))) {
    return { valid: false, difference: 0 };
  }
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  const difference = Math.round((debit - credit) * 100) / 100;
  return { valid: difference === 0 && debit > 0, difference };
}

export function reverseGlLines(lines: GlLineInput[]): GlLineInput[] {
  return lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit }));
}

export function calculatePeriodBalance(
  opening: number,
  movements: Array<{ date: string; debit: number; credit: number; status: VoucherStatus }>,
  from: string,
  to: string,
) {
  const posted = movements.filter((row) => row.status === "posted" || row.status === "reversed");
  const broughtForward = posted.filter((row) => row.date < from).reduce((sum, row) => sum + row.debit - row.credit, opening);
  const period = posted.filter((row) => row.date >= from && row.date <= to);
  const debit = period.reduce((sum, row) => sum + row.debit, 0);
  const credit = period.reduce((sum, row) => sum + row.credit, 0);
  return { opening: broughtForward, debit, credit, closing: broughtForward + debit - credit };
}

export class IsolatedAccountingFixture {
  private next = new Map<VoucherType, number>();
  private byKey = new Map<string, VoucherFixture>();
  private rows = new Map<string, VoucherFixture>();
  private queue = Promise.resolve();

  async post(type: VoucherType, date: string, lines: GlLineInput[], idempotencyKey: string) {
    let release: () => void = () => undefined;
    const prior = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try {
      const existing = this.byKey.get(idempotencyKey);
      if (existing) return existing;
      if (!validateGlLines(lines).valid) throw new Error("Unbalanced voucher");
      const number = this.next.get(type) ?? 1;
      this.next.set(type, number + 1);
      const voucher: VoucherFixture = { id: `${type}-${number}`, type, date, status: "posted", number, idempotencyKey, lines };
      this.rows.set(voucher.id, voucher);
      this.byKey.set(idempotencyKey, voucher);
      return voucher;
    } finally { release(); }
  }

  async reverse(id: string, date: string) {
    const original = this.rows.get(id);
    if (!original || original.status !== "posted") throw new Error("Only posted vouchers can be reversed");
    const reversal = await this.post(original.type, date, reverseGlLines(original.lines), `reversal:${id}`);
    original.status = "reversed";
    reversal.reversalOf = id;
    return reversal;
  }
}