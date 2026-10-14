import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261014220000_mrp_multilevel_bom_components.sql", import.meta.url),
  "utf8",
);

describe("staged multi-level BOM migration safety contract", () => {
  it("adds explicit subassembly links with same-company constraints", () => {
    expect(migration).toContain("add column if not exists component_model_id");
    expect(migration).toContain("bom_revision_lines_company_component_model_fk");
    expect(migration).toContain("references public.product_models(company_id, id)");
    expect(migration).toContain("bom_revision_lines_company_parent_fk");
    expect(migration).toContain("bom_revision_lines_company_raw_material_fk");
    expect(migration).toContain("bom_revision_lines_company_stock_item_fk");
  });

  it("requires exactly one component selector for new or changed lines", () => {
    expect(migration).toContain("num_nonnulls(raw_material_id, stock_item_id, component_model_id) = 1");
    expect(migration).toContain("not valid");
  });

  it("does not rewrite business rows or drop existing structures", () => {
    expect(migration).not.toMatch(/\b(drop\s+table|truncate|delete\s+from)\b/i);
    expect(migration).not.toMatch(/\bupdate\s+public\./i);
  });
});
