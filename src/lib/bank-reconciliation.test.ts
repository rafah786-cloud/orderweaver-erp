import { describe, expect, it } from "vitest";
import { bankLineAmountsMatch, validBankStatementAmounts } from "./bank-reconciliation";

describe("bankLineAmountsMatch", () => {
  it("matches equal debit and credit pairs", () => {
    expect(bankLineAmountsMatch({ debit: 100.25, credit: 0 }, { debit: "100.25", credit: "0.00" })).toBe(true);
    expect(bankLineAmountsMatch({ debit: 0, credit: 450 }, { debit: "0.00", credit: "450.00" })).toBe(true);
  });

  it("rejects a reversed money direction even when the net values can cancel", () => {
    expect(bankLineAmountsMatch({ debit: 100, credit: 0 }, { debit: 0, credit: 100 })).toBe(false);
  });

  it("rejects a mismatch on either side", () => {
    expect(bankLineAmountsMatch({ debit: 100, credit: 0 }, { debit: 99.99, credit: 0 })).toBe(false);
    expect(bankLineAmountsMatch({ debit: 0, credit: 100 }, { debit: 0, credit: 100.01 })).toBe(false);
  });

  it("rejects invalid non-finite values", () => {
    expect(bankLineAmountsMatch({ debit: Number.NaN, credit: 0 }, { debit: 0, credit: 0 })).toBe(false);
  });
});

describe("validBankStatementAmounts", () => {
  it("requires one positive side only", () => {
    expect(validBankStatementAmounts(100, 0)).toBe(true);
    expect(validBankStatementAmounts(0, 100)).toBe(true);
    expect(validBankStatementAmounts(0, 0)).toBe(false);
    expect(validBankStatementAmounts(100, 100)).toBe(false);
    expect(validBankStatementAmounts(-1, 0)).toBe(false);
    expect(validBankStatementAmounts(0, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
