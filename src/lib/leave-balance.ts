/**
 * Simple leave accrual and balance helpers for HR operations.
 * Does not post payroll; screens should persist balances through approved server paths.
 */

export type LeaveType = "casual" | "sick" | "earned" | "unpaid";

export type LeaveBalance = {
  leaveType: LeaveType;
  opening: number;
  accrued: number;
  taken: number;
  adjustment: number;
};

export type LeaveBalanceResult = LeaveBalance & {
  available: number;
};

export function computeLeaveAvailable(row: LeaveBalance): LeaveBalanceResult {
  for (const [label, value] of [
    ["opening", row.opening],
    ["accrued", row.accrued],
    ["taken", row.taken],
    ["adjustment", row.adjustment],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be a finite number`);
    }
  }
  if (row.taken < 0) throw new Error("taken cannot be negative");
  if (row.accrued < 0) throw new Error("accrued cannot be negative");
  const available = row.opening + row.accrued - row.taken + row.adjustment;
  return { ...row, available };
}

/**
 * Monthly accrual for earned leave: standard policy example of 1.25 days / month
 * when the employee was active the full month (caller decides active fraction).
 */
export function monthlyEarnedLeaveAccrual(activeFraction = 1, ratePerMonth = 1.25): number {
  if (!Number.isFinite(activeFraction) || activeFraction < 0 || activeFraction > 1) {
    throw new Error("activeFraction must be between 0 and 1");
  }
  if (!Number.isFinite(ratePerMonth) || ratePerMonth < 0) {
    throw new Error("ratePerMonth must be non-negative");
  }
  return Math.round(ratePerMonth * activeFraction * 100) / 100;
}

export type LeaveRequestEvaluation = {
  allowed: boolean;
  reasons: string[];
  available: number;
  requested: number;
};

export function evaluateLeaveRequest(
  balance: LeaveBalance,
  requestedDays: number,
  allowNegative = false,
): LeaveRequestEvaluation {
  if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
    return { allowed: false, reasons: ["Requested days must be a positive number."], available: 0, requested: requestedDays };
  }
  const { available } = computeLeaveAvailable(balance);
  if (balance.leaveType === "unpaid") {
    return { allowed: true, reasons: [], available, requested: requestedDays };
  }
  if (!allowNegative && requestedDays > available + 1e-9) {
    return {
      allowed: false,
      reasons: [`Requested ${requestedDays} day(s) exceeds available balance of ${available}.`],
      available,
      requested: requestedDays,
    };
  }
  return { allowed: true, reasons: [], available, requested: requestedDays };
}
