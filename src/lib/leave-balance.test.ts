import { describe, expect, it } from "vitest";
import {
  computeLeaveAvailable,
  evaluateLeaveRequest,
  monthlyEarnedLeaveAccrual,
} from "./leave-balance";

describe("leave balance", () => {
  it("computes available balance", () => {
    expect(
      computeLeaveAvailable({
        leaveType: "earned",
        opening: 10,
        accrued: 1.25,
        taken: 2,
        adjustment: 0,
      }).available,
    ).toBeCloseTo(9.25, 6);
  });

  it("accrues earned leave by active fraction", () => {
    expect(monthlyEarnedLeaveAccrual(1)).toBe(1.25);
    expect(monthlyEarnedLeaveAccrual(0.5)).toBe(0.63);
  });

  it("blocks overdraw on paid leave types", () => {
    const balance = {
      leaveType: "casual" as const,
      opening: 2,
      accrued: 0,
      taken: 0,
      adjustment: 0,
    };
    expect(evaluateLeaveRequest(balance, 3).allowed).toBe(false);
    expect(evaluateLeaveRequest(balance, 1).allowed).toBe(true);
    expect(evaluateLeaveRequest({ ...balance, leaveType: "unpaid" }, 5).allowed).toBe(true);
  });
});
