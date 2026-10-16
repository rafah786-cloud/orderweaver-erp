import { describe, expect, it } from "vitest";
import {
  CREDIT_AGE_THRESHOLD_INR,
  CREDIT_HARD_LIMIT_INR,
  creditBlockMessage,
  evaluatePartyCredit,
} from "./credit-control";

describe("evaluatePartyCredit", () => {
  it("allows parties within both limits", () => {
    const result = evaluatePartyCredit({
      outstandingTotal: 40_000,
      outstandingOlderThanMaxDays: 0,
    });
    expect(result.allowed).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("blocks when total outstanding hits the hard limit", () => {
    const result = evaluatePartyCredit({
      outstandingTotal: CREDIT_HARD_LIMIT_INR,
      outstandingOlderThanMaxDays: 0,
    });
    expect(result.blocked).toBe(true);
    expect(result.reasons[0]).toMatch(/credit limit/);
    expect(creditBlockMessage(result).length).toBeGreaterThan(10);
  });

  it("blocks when aged outstanding hits the age threshold", () => {
    const result = evaluatePartyCredit({
      outstandingTotal: 60_000,
      outstandingOlderThanMaxDays: CREDIT_AGE_THRESHOLD_INR,
    });
    expect(result.blocked).toBe(true);
    expect(result.reasons.some((r) => r.includes("90 days"))).toBe(true);
  });

  it("respects a lower party-specific credit limit", () => {
    const result = evaluatePartyCredit({
      outstandingTotal: 80_000,
      outstandingOlderThanMaxDays: 0,
      partyCreditLimit: 75_000,
    });
    expect(result.blocked).toBe(true);
    expect(result.hardLimit).toBe(75_000);
  });

  it("rejects inconsistent or non-finite inputs", () => {
    expect(
      evaluatePartyCredit({
        outstandingTotal: 10,
        outstandingOlderThanMaxDays: 20,
      }).blocked,
    ).toBe(true);
    expect(
      evaluatePartyCredit({
        outstandingTotal: Number.NaN,
        outstandingOlderThanMaxDays: 0,
      }).blocked,
    ).toBe(true);
  });
});
