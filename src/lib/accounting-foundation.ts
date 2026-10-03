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

export class IsolatedVoucherPoster {
  private next = 8;
  private consumed = 0;
  private rows = new Map<string, { id: string; number: string; key: string | null; lines: GlLineInput[] }>();
  private queue = Promise.resolve();
  readonly historical = Array.from({ length: 7 }, (_, index) => ({ id: `existing-${index + 1}`, number: `SAL/${index + 1}`, key: null }));

  constructor(private readonly ledgers: Record<string, { active: boolean }>, private readonly yearOpen = true) {
    this.historical.forEach((row) => this.rows.set(row.id, { ...row, lines: [] }));
  }

  async post(lines: GlLineInput[], key: string, date = "2026-04-01") {
    let release = () => undefined;
    const prior = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try {
      const duplicate = [...this.rows.values()].find((row) => row.key === key);
      if (duplicate) return { id: duplicate.id, voucherNumber: duplicate.number, created: false };
      if (!this.yearOpen || date < "2025-04-01" || date > "2027-03-31") throw new Error("closed or missing financial year");
      if (lines.length < 2) throw new Error("at least two entries required");
      for (const line of lines) {
        const ledger = this.ledgers[line.ledger_account_id];
        if (!ledger) throw new Error("invalid ledger");
        if (!ledger.active) throw new Error("inactive ledger");
        if (line.debit < 0 || line.credit < 0 || (line.debit > 0) === (line.credit > 0)) throw new Error("entry must have one side");
      }
      if (!validateGlLines(lines).valid) throw new Error("unbalanced voucher");
      const number = `SAL/${this.next}`;
      this.next += 1;
      this.consumed += 1;
      const id = `new-${this.consumed}`;
      this.rows.set(id, { id, number, key, lines });
      return { id, voucherNumber: number, created: true };
    } finally { release(); }
  }

  series() { return this.next; }
  historicalUntouched() { return this.historical.every((row) => this.rows.get(row.id)?.key === null); }
}

export class IsolatedFinancialYearFixture {
  status: "open" | "closed" = "open";
  events: Array<{ action: "closed" | "reopened"; reason?: string }> = [];

  constructor(readonly start: string, readonly end: string) {}

  accepts(date: string) {
    return this.status === "open" && date >= this.start && date <= this.end;
  }

  close(hasDrafts = false, hasUnbalanced = false) {
    if (hasDrafts) throw new Error("Financial year has draft vouchers");
    if (hasUnbalanced) throw new Error("Financial year has an unbalanced voucher");
    this.status = "closed";
    this.events.push({ action: "closed" });
  }

  reopen(reason: string) {
    if (reason.trim().length < 3) throw new Error("Reopen reason required");
    this.status = "open";
    this.events.push({ action: "reopened", reason });
  }
}