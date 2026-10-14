import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261014230000_quality_workflow_integrity.sql", import.meta.url),
  "utf8",
);

describe("staged quality workflow integrity migration", () => {
  it("prevents negative or over-allocated inspection quantities", () => {
    expect(migration).toContain("quantity_inspected >= 0");
    expect(migration).toContain("quantity_accepted >= 0");
    expect(migration).toContain("quantity_rejected >= 0");
    expect(migration).toContain("quantity_accepted + quantity_rejected <= quantity_inspected");
    expect(migration).toContain("quality_inspections_nonnegative_quantities_ck");
  });

  it("rejects inverted numeric specification limits and incomplete CAPA completion", () => {
    expect(migration).toContain("lower_limit <= upper_limit");
    expect(migration).toContain("quality_results_valid_limits_ck");
    expect(migration).toContain("quality_capa_done_requires_effectiveness_ck");
    expect(migration).toContain("status <> 'done'");
    expect(migration).toContain("nullif(btrim(effectiveness_result), '') is not null");
  });

  it("requires containment, root cause, disposition and closed CAPA actions before NC closure", () => {
    expect(migration).toContain("quality_nonconformance_closure_guard");
    expect(migration).toContain("before insert or update of status");
    expect(migration).toContain("Quality nonconformance closure requires disposition, root cause and containment action");
    expect(migration).toContain("Quality nonconformance closure blocked while CAPA actions remain open");
    expect(migration).toContain("action.status not in ('done', 'cancelled')");
  });

  it("stages constraints without rewriting or deleting historical quality records", () => {
    expect(migration).toMatch(/check\s*\([\s\S]*?\)\s*not valid/i);
    expect(migration).not.toMatch(/\b(update\s+public\.|delete\s+from|truncate\s+|drop\s+table)\b/i);
  });
});
