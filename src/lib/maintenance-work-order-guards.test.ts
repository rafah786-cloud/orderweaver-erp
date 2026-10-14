import { describe, expect, it } from "vitest";
import { validateMaintenanceCompletion } from "./maintenance-work-order-guards";

describe("maintenance work order completion guard", () => {
  it("requires a meaningful resolution", () => {
    expect(validateMaintenanceCompletion({ resolution: "", downtimeMinutes: 0 })).toMatch(/resolution/);
    expect(validateMaintenanceCompletion({ resolution: "fixed", downtimeMinutes: 0 })).toMatch(/10 characters/);
  });
  it("rejects negative or non-finite downtime and cost values", () => {
    expect(validateMaintenanceCompletion({ resolution: "Replaced worn bearing", downtimeMinutes: -1 })).toMatch(/Downtime minutes/);
    expect(validateMaintenanceCompletion({ resolution: "Replaced worn bearing", laborCost: Number.POSITIVE_INFINITY })).toMatch(/Labour cost/);
    expect(validateMaintenanceCompletion({ resolution: "Replaced worn bearing", partsCost: -20 })).toMatch(/Parts cost/);
  });
  it("accepts reconciled non-negative completion data", () => {
    expect(validateMaintenanceCompletion({ resolution: "Replaced worn bearing and verified run test", downtimeMinutes: 35, laborCost: 450, partsCost: 850, otherCost: 0 })).toBeNull();
  });
});
