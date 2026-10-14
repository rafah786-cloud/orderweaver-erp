import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261014170000_require_final_qc_before_release.sql",
  "utf8",
);

describe("production final-QC release gate", () => {
  it("requires a passed final inspection scoped to the active company and order", () => {
    expect(migration).toContain("IF p_status='ready' AND NOT EXISTS");
    expect(migration).toContain("qi.company_id=company");
    expect(migration).toContain("qi.production_order_id=po.id");
    expect(migration).toContain("lower(btrim(qi.stage))='final'");
    expect(migration).toContain("lower(btrim(qi.status))='passed'");
  });

  it("requires full acceptance and zero rejected units before release", () => {
    expect(migration).toContain("qi.quantity_inspected > 0");
    expect(migration).toContain("qi.quantity_accepted = qi.quantity_inspected");
    expect(migration).toContain("qi.quantity_rejected = 0");
    expect(migration).toContain("Final QC release blocked");
  });

  it("keeps the atomic transition callable only by authenticated users", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.advance_production_order_atomic(uuid,text,text,text) FROM PUBLIC,anon,authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.advance_production_order_atomic(uuid,text,text,text) TO authenticated");
  });
});
