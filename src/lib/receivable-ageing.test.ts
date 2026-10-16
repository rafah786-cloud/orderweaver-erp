import { describe, expect, it } from "vitest";
import { buildReceivableAgeing, daysPastDue } from "./receivable-ageing";

describe("daysPastDue", () => {
  it("computes calendar-day difference", () => {
    expect(daysPastDue("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysPastDue("2026-02-01", "2026-01-15")).toBeLessThan(0);
  });
});

describe("buildReceivableAgeing", () => {
  it("buckets open balances by party and age", () => {
    const report = buildReceivableAgeing([
      { billId: "1", partyId: "p1", partyName: "Alpha", daysPastDue: -5, openAmount: 1000 },
      { billId: "2", partyId: "p1", partyName: "Alpha", daysPastDue: 15, openAmount: 2000 },
      { billId: "3", partyId: "p2", partyName: "Beta", daysPastDue: 45, openAmount: 3000 },
      { billId: "4", partyId: "p2", partyName: "Beta", daysPastDue: 120, openAmount: 4000 },
      { billId: "bad", partyId: "p3", partyName: "Bad", daysPastDue: 10, openAmount: 0 },
    ]);
    expect(report.skippedInvalid).toBe(1);
    expect(report.rows).toHaveLength(2);
    const alpha = report.rows.find((r) => r.partyId === "p1")!;
    expect(alpha.buckets.current).toBe(1000);
    expect(alpha.buckets["1-30"]).toBe(2000);
    expect(alpha.total).toBe(3000);
    const beta = report.rows.find((r) => r.partyId === "p2")!;
    expect(beta.buckets["31-60"]).toBe(3000);
    expect(beta.buckets["90+"]).toBe(4000);
    expect(report.totals.total).toBe(10000);
  });
});
