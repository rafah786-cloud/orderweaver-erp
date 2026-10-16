/**
 * Party credit-control rules for Mattress Maestro.
 * Matches the product contract: block new invoices when outstanding ≥ ₹1,50,000
 * OR when outstanding ≥ ₹50,000 is older than 90 days.
 * Callers must supply verified outstanding figures from posted ledger activity.
 */

export const CREDIT_HARD_LIMIT_INR = 150_000;
export const CREDIT_AGE_THRESHOLD_INR = 50_000;
export const CREDIT_MAX_AGE_DAYS = 90;

export type CreditEvaluationInput = {
  /** Total open receivable for the party (posted, bill-wise preferred). */
  outstandingTotal: number;
  /** Portion of outstanding with invoice/bill age > CREDIT_MAX_AGE_DAYS. */
  outstandingOlderThanMaxDays: number;
  /** Optional party-specific override; when set and finite, replaces the hard limit. */
  partyCreditLimit?: number | null;
};

export type CreditEvaluationResult = {
  allowed: boolean;
  blocked: boolean;
  reasons: string[];
  hardLimit: number;
  outstandingTotal: number;
  outstandingOlderThanMaxDays: number;
};

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function evaluatePartyCredit(input: CreditEvaluationInput): CreditEvaluationResult {
  if (!finiteNonNegative(input.outstandingTotal) || !finiteNonNegative(input.outstandingOlderThanMaxDays)) {
    return {
      allowed: false,
      blocked: true,
      reasons: ["Outstanding figures must be finite and non-negative before credit can be evaluated."],
      hardLimit: CREDIT_HARD_LIMIT_INR,
      outstandingTotal: Number(input.outstandingTotal),
      outstandingOlderThanMaxDays: Number(input.outstandingOlderThanMaxDays),
    };
  }

  if (input.outstandingOlderThanMaxDays > input.outstandingTotal + 1e-6) {
    return {
      allowed: false,
      blocked: true,
      reasons: ["Aged outstanding cannot exceed total outstanding."],
      hardLimit: CREDIT_HARD_LIMIT_INR,
      outstandingTotal: input.outstandingTotal,
      outstandingOlderThanMaxDays: input.outstandingOlderThanMaxDays,
    };
  }

  const hardLimit =
    input.partyCreditLimit != null && Number.isFinite(input.partyCreditLimit) && input.partyCreditLimit > 0
      ? input.partyCreditLimit
      : CREDIT_HARD_LIMIT_INR;

  const reasons: string[] = [];
  if (input.outstandingTotal >= hardLimit) {
    reasons.push(
      `Outstanding ₹${input.outstandingTotal.toLocaleString("en-IN")} meets or exceeds the credit limit of ₹${hardLimit.toLocaleString("en-IN")}.`,
    );
  }
  if (input.outstandingOlderThanMaxDays >= CREDIT_AGE_THRESHOLD_INR) {
    reasons.push(
      `₹${input.outstandingOlderThanMaxDays.toLocaleString("en-IN")} is outstanding for more than ${CREDIT_MAX_AGE_DAYS} days (threshold ₹${CREDIT_AGE_THRESHOLD_INR.toLocaleString("en-IN")}).`,
    );
  }

  return {
    allowed: reasons.length === 0,
    blocked: reasons.length > 0,
    reasons,
    hardLimit,
    outstandingTotal: input.outstandingTotal,
    outstandingOlderThanMaxDays: input.outstandingOlderThanMaxDays,
  };
}

/** Warning copy for UI when a new invoice is blocked. */
export function creditBlockMessage(result: CreditEvaluationResult): string {
  if (!result.blocked) return "";
  return result.reasons.join(" ");
}
