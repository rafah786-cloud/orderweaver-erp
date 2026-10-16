import { describe, expect, it } from "vitest";
import { createMonthEndChecklist, setCloseTaskStatus } from "./month-end-close";

describe("month-end close checklist", () => {
  it("starts incomplete with standard tasks", () => {
    const checklist = createMonthEndChecklist("2026-09");
    expect(checklist.tasks.length).toBeGreaterThanOrEqual(8);
    expect(checklist.readyToClose).toBe(false);
    expect(checklist.completionRatio).toBe(0);
  });

  it("becomes ready only when every actionable task is done", () => {
    let checklist = createMonthEndChecklist("2026-09");
    for (const task of checklist.tasks) {
      checklist = setCloseTaskStatus(checklist, task.id, "done");
    }
    expect(checklist.readyToClose).toBe(true);
    expect(checklist.completionRatio).toBe(1);
  });

  it("tracks blockers separately from pending work", () => {
    let checklist = createMonthEndChecklist("2026-09");
    checklist = setCloseTaskStatus(checklist, "bank-reconcile", "blocked", "Unmatched deposit ₹12,500");
    expect(checklist.openBlockers).toContain("Unmatched deposit ₹12,500");
    expect(checklist.readyToClose).toBe(false);
  });
});
