import { describe, expect, it } from "vitest";
import { calculatePeriodBalance, IsolatedAccountingFixture, IsolatedFinancialYearFixture, IsolatedVoucherPoster, reverseGlLines, validateGlLines, type GlLineInput, type VoucherStatus } from "./accounting-foundation";

const a = "ledger-a";
const b = "ledger-b";
const balanced = (amount: number): GlLineInput[] => [
  { ledger_account_id: a, debit: amount, credit: 0 },
  { ledger_account_id: b, debit: 0, credit: amount },
];

describe("Phase 1 accounting foundation", () => {
  it.each(["sales", "purchase", "receipt", "payment", "contra", "journal", "debit_note", "credit_note"] as const)(
    "posts a realistic balanced %s voucher", async (type) => {
      const db = new IsolatedAccountingFixture();
      const voucher = await db.post(type, "2026-04-01", balanced(1250.55), `test:${type}`);
      expect(voucher).toMatchObject({ type, status: "posted", number: 1 });
    },
  );

  it("rejects malformed and unbalanced double entries atomically", async () => {
    const db = new IsolatedAccountingFixture();
    await expect(db.post("journal", "2026-04-01", [{ ledger_account_id: a, debit: 10, credit: 0 }], "bad:1")).rejects.toThrow();
    await expect(db.post("journal", "2026-04-01", balanced(0), "bad:2")).rejects.toThrow();
    expect(validateGlLines([{ ledger_account_id: a, debit: 10, credit: 0 }, { ledger_account_id: b, debit: 0, credit: 9 }])).toEqual({ valid: false, difference: 1 });
  });

  it("returns the original result for an idempotent retry", async () => {
    const db = new IsolatedAccountingFixture();
    const first = await db.post("receipt", "2026-04-01", balanced(500), "retry-key");
    const retry = await db.post("receipt", "2026-04-01", balanced(500), "retry-key");
    expect(retry).toBe(first);
  });

  it("assigns unique sequential numbers under concurrent entry", async () => {
    const db = new IsolatedAccountingFixture();
    const rows = await Promise.all(Array.from({ length: 100 }, (_, index) => db.post("payment", "2026-04-01", balanced(index + 1), `concurrent:${index}`)));
    expect(new Set(rows.map((row) => row.number)).size).toBe(100);
    expect(rows.map((row) => row.number).sort((x, y) => x - y)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
  });

  it("creates a linked reversal whose ledger effects net to zero", async () => {
    const db = new IsolatedAccountingFixture();
    const original = await db.post("credit_note", "2026-04-01", balanced(1180), "credit-note:1");
    const reversal = await db.reverse(original.id, "2026-04-02");
    expect(reversal.reversalOf).toBe(original.id);
    expect(original.status).toBe("reversed");
    expect(validateGlLines(reverseGlLines(original.lines)).valid).toBe(true);
    expect([...original.lines, ...reversal.lines].reduce((sum, line) => sum + line.debit - line.credit, 0)).toBe(0);
  });

  it("models cancellation through a compensating reversal rather than deleting history", async () => {
    const db = new IsolatedAccountingFixture();
    const original = await db.post("debit_note", "2026-04-01", balanced(200), "debit-note:1");
    const cancellationEntry = await db.reverse(original.id, "2026-04-02");
    expect(cancellationEntry.lines).toEqual(reverseGlLines(original.lines));
    expect(original.status).toBe("reversed");
  });

  it("calculates backdated FY opening, movement and closing without drafts or cancellations", () => {
    const movements: Array<{ date: string; debit: number; credit: number; status: VoucherStatus }> = [
      { date: "2026-03-31", debit: 100, credit: 0, status: "posted" },
      { date: "2026-04-01", debit: 25, credit: 0, status: "posted" },
      { date: "2026-04-02", debit: 0, credit: 10, status: "reversed" },
      { date: "2026-04-03", debit: 999, credit: 0, status: "draft" },
      { date: "2026-04-04", debit: 999, credit: 0, status: "cancelled" },
    ];
    expect(calculatePeriodBalance(50, movements, "2026-04-01", "2027-03-31")).toEqual({ opening: 150, debit: 25, credit: 10, closing: 165 });
  });

  it("enforces FY boundaries and controlled close/reopen", () => {
    const year = new IsolatedFinancialYearFixture("2026-04-01", "2027-03-31");
    expect(year.accepts("2026-04-01")).toBe(true);
    expect(year.accepts("2027-03-31")).toBe(true);
    expect(year.accepts("2026-03-31")).toBe(false);
    expect(() => year.close(true)).toThrow("draft vouchers");
    expect(() => year.close(false, true)).toThrow("unbalanced voucher");
    year.close();
    expect(year.accepts("2026-09-01")).toBe(false);
    expect(() => year.reopen("x")).toThrow("reason");
    year.reopen("Approved correction");
    expect(year.accepts("2026-09-01")).toBe(true);
    expect(year.events).toEqual([{ action: "closed" }, { action: "reopened", reason: "Approved correction" }]);
  });
});

describe("create_gl_voucher fixture", () => {
  const ledgers = { a: { active: true }, b: { active: true }, old: { active: false } };
  const lines = [{ ledger_account_id: "a", debit: 100, credit: 0 }, { ledger_account_id: "b", debit: 0, credit: 100 }];

  it("posts a balanced voucher and leaves the existing seven untouched", async () => {
    const db = new IsolatedVoucherPoster(ledgers);
    const posted = await db.post(lines, "voucher-key-1");
    expect(posted).toEqual({ id: "new-1", voucherNumber: "SAL/8", created: true });
    expect(db.historicalUntouched()).toBe(true);
  });

  it("rejects an unbalanced voucher without consuming a number", async () => {
    const db = new IsolatedVoucherPoster(ledgers);
    await expect(db.post([{ ledger_account_id: "a", debit: 100, credit: 0 }, { ledger_account_id: "b", debit: 0, credit: 90 }], "voucher-key-2")).rejects.toThrow("unbalanced");
    expect(db.series()).toBe(8);
  });

  it("returns the same voucher for a duplicate key, including concurrent calls", async () => {
    const db = new IsolatedVoucherPoster(ledgers);
    const [first, second] = await Promise.all([db.post(lines, "same-key-1"), db.post(lines, "same-key-1")]);
    expect(first.id).toBe(second.id);
    expect(db.series()).toBe(9);
  });

  it("rejects an invalid or inactive ledger and a closed year", async () => {
    const db = new IsolatedVoucherPoster(ledgers);
    await expect(db.post([{ ledger_account_id: "missing", debit: 10, credit: 0 }, { ledger_account_id: "b", debit: 0, credit: 10 }], "voucher-key-3")).rejects.toThrow("invalid ledger");
    await expect(db.post([{ ledger_account_id: "old", debit: 10, credit: 0 }, { ledger_account_id: "b", debit: 0, credit: 10 }], "voucher-key-4")).rejects.toThrow("inactive ledger");
    const closed = new IsolatedVoucherPoster(ledgers, false);
    await expect(closed.post(lines, "voucher-key-5", "2026-04-02")).rejects.toThrow("financial year");
  });
});