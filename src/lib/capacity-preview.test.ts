import { describe, expect, it } from "vitest";
import { calculateCapacityPreview, type CapacityOperation, type CapacityRoutingOperation, type CapacityWorkCenter } from "./capacity-preview";

const operation = (overrides: Partial<CapacityOperation> = {}): CapacityOperation => ({
  id: "op-1", status: "ready", planned_qty: 10,
  planned_start: "2026-10-14T08:00:00+05:30", planned_end: "2026-10-14T16:00:00+05:30",
  routing_operation_id: "route-op-1", ...overrides,
});
const routing = (overrides: Partial<CapacityRoutingOperation> = {}): CapacityRoutingOperation => ({
  id: "route-op-1", name: "Tape Edge", work_center_id: "wc-1", setup_minutes: 20, run_minutes_per_unit: 5, ...overrides,
});
const center = (overrides: Partial<CapacityWorkCenter> = {}): CapacityWorkCenter => ({
  id: "wc-1", code: "TE-01", name: "Tape Edge 1", capacity_minutes_per_day: 480, efficiency_pct: 80, ...overrides,
});

describe("read-only capacity preview", () => {
  it("calculates planned minutes and compares them with efficiency-adjusted daily capacity", () => {
    const result = calculateCapacityPreview([operation()], [routing()], [center()]);
    expect(result.dailyLoads).toHaveLength(1);
    expect(result.dailyLoads[0]).toMatchObject({
      plannedMinutes: 70,
      effectiveCapacityMinutes: 384,
      utilizationPct: 70 / 384 * 100,
      overCapacity: false,
    });
  });

  it("flags an over-capacity work center after aggregating operations for the same day", () => {
    const result = calculateCapacityPreview(
      [operation(), operation({ id: "op-2", planned_qty: 80 })],
      [routing()], [center()],
    );
    expect(result.dailyLoads[0].overCapacity).toBe(true);
    expect(result.dailyLoads[0].operationCount).toBe(2);
  });

  it("keeps undated and multi-day operations unscheduled rather than allocating guessed daily loads", () => {
    const result = calculateCapacityPreview([
      operation({ planned_start: null, planned_end: null }),
      operation({ id: "op-2", planned_start: "2026-10-14T08:00:00Z", planned_end: "2026-10-15T16:00:00Z" }),
    ], [routing()], [center()]);
    expect(result.dailyLoads).toHaveLength(0);
    expect(result.unscheduledMinutesByWorkCenter[0].minutes).toBe(140);
    expect(result.unscheduledMinutesByWorkCenter[0].operationCount).toBe(2);
  });

  it("reports unmapped and invalid operations without inventing load", () => {
    const result = calculateCapacityPreview([
      operation({ id: "op-2", routing_operation_id: null }),
      operation({ id: "op-3", planned_qty: 0 }),
    ], [routing()], [center()]);
    expect(result.unassignedOperationCount).toBe(1);
    expect(result.invalidOperationCount).toBe(1);
    expect(result.dailyLoads).toHaveLength(0);
  });
});
