import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261014070000_plm_eco_release_governance.sql", import.meta.url), "utf8");

describe("staged PLM/ECO migration safety contract", () => {
  it("uses additive columns, scoped foreign keys and lifecycle triggers", () => {
    expect(migration).toContain("add column if not exists engineering_change_order_id");
    expect(migration).toContain("bom_revisions_company_eco_fk");
    expect(migration).toContain("engineering_change_order_lifecycle_guard");
    expect(migration).toContain("bom_revision_eco_release_guard");
    expect(migration).toContain("guard_released_bom_revision_line");
    expect(migration).toContain("new.company_id");
  });

  it("fails closed on self-approval, premature release, cross-company links and mutable released content", () => {
    expect(migration).toContain("new.requested_by = new.approved_by");
    expect(migration).toContain("new.effective_from > current_date");
    expect(migration).toContain("Linked ECO must be released");
    expect(migration).toContain("Released BOM revision content is immutable");
    expect(migration).toContain("ECO line must reference an existing ECO in the same company");
  });

  it("does not contain destructive table or business-row operations", () => {
    expect(migration).not.toMatch(/\b(drop\s+table|truncate|delete\s+from)\b/i);
    expect(migration).not.toContain("update public.bom_revisions set");
    expect(migration).not.toContain("update public.engineering_change_orders set");
  });
});
