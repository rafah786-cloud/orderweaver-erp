import { describe, expect, it } from "vitest";
import {
  canSetWorkbenchStatus,
  isGovernedWorkbenchStatus,
  normalizeWorkbenchSearch,
  validateQualityInspection,
  validateWorkbenchDateRanges,
  validateWorkbenchFieldValue,
} from "./enterprise-workbench-guards";
import { validateCapaActionCompletion } from "./capa-action-guards";
import { validateMaintenanceCompletion } from "./maintenance-work-order-guards";

describe("enterprise workbench status governance", () => {
  it("identifies governed statuses", () => {
    expect(isGovernedWorkbenchStatus("released")).toBe(true);
    expect(isGovernedWorkbenchStatus("draft")).toBe(false);
  });

  it("allows ordinary status changes and blocks entry into governed states", () => {
    expect(canSetWorkbenchStatus("draft")).toBe(true);
    expect(canSetWorkbenchStatus("in_progress", "draft")).toBe(true);
    expect(canSetWorkbenchStatus("released", "draft")).toBe(false);
    expect(canSetWorkbenchStatus("released", "released")).toBe(true);
  });
});

describe("validateQualityInspection", () => {
  it("requires balanced quantities for completed inspections", () => {
    expect(
      validateQualityInspection({
        status: "passed",
        quantity_inspected: 10,
        quantity_accepted: 10,
        quantity_rejected: 0,
      }),
    ).toBeNull();

    expect(
      validateQualityInspection({
        status: "passed",
        quantity_inspected: 10,
        quantity_accepted: 9,
        quantity_rejected: 0,
      }),
    ).toMatch(/every inspected unit/);

    expect(
      validateQualityInspection({
        status: "failed",
        quantity_inspected: 5,
        quantity_accepted: 5,
        quantity_rejected: 0,
      }),
    ).toMatch(/at least one rejected/);

    expect(
      validateQualityInspection({
        status: "conditional",
        quantity_inspected: 4,
        quantity_accepted: 2,
        quantity_rejected: 1,
      }),
    ).toMatch(/equal the inspected/);
  });

  it("ignores open inspections", () => {
    expect(
      validateQualityInspection({
        status: "open",
        quantity_inspected: 0,
        quantity_accepted: 0,
        quantity_rejected: 0,
      }),
    ).toBeNull();
  });
});

describe("validateCapaActionCompletion", () => {
  it("requires a substantive effectiveness result", () => {
    expect(validateCapaActionCompletion("fixed")).toMatch(/at least 10/);
    expect(validateCapaActionCompletion("Verified no recurrence in 30 days")).toBeNull();
  });
});

describe("validateMaintenanceCompletion", () => {
  it("requires resolution and non-negative costs", () => {
    expect(
      validateMaintenanceCompletion({
        resolution: "short",
        downtimeMinutes: 0,
        laborCost: 0,
        partsCost: 0,
        otherCost: 0,
      }),
    ).toMatch(/resolution/);

    expect(
      validateMaintenanceCompletion({
        resolution: "Replaced bearing and tested under load",
        downtimeMinutes: -1,
        laborCost: 0,
        partsCost: 0,
        otherCost: 0,
      }),
    ).toMatch(/Downtime/);

    expect(
      validateMaintenanceCompletion({
        resolution: "Replaced bearing and tested under load",
        downtimeMinutes: 30,
        laborCost: 500,
        partsCost: 200,
        otherCost: 0,
      }),
    ).toBeNull();
  });
});

describe("workbench field and date helpers", () => {
  it("normalizes search input", () => {
    expect(normalizeWorkbenchSearch("  Foam!!!  sheet  ")).toBe("Foam sheet");
  });

  it("validates required numeric fields", () => {
    expect(validateWorkbenchFieldValue({ label: "Qty", type: "number", required: true, min: 0 }, "")).toMatch(/required/);
    expect(validateWorkbenchFieldValue({ label: "Qty", type: "number", min: 0 }, "-1")).toMatch(/at least/);
    expect(validateWorkbenchFieldValue({ label: "Qty", type: "number", min: 0 }, "3")).toBeNull();
  });

  it("rejects inverted date ranges", () => {
    expect(
      validateWorkbenchDateRanges({
        horizon_start: "2026-12-01",
        horizon_end: "2026-01-01",
      }),
    ).toMatch(/cannot be after/);
    expect(
      validateWorkbenchDateRanges({
        effective_from: "2026-01-01",
        effective_to: "2026-12-31",
      }),
    ).toBeNull();
  });
});
