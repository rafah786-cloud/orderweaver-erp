import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261014240000_maintenance_workflow_integrity.sql", import.meta.url),
  "utf8",
);

describe("staged maintenance workflow integrity migration", () => {
  it("enforces same-company relationships across assets, plans, work orders, work centres and spares", () => {
    expect(migration).toContain("maintenance_plans_company_asset_fk");
    expect(migration).toContain("maintenance_work_orders_company_asset_fk");
    expect(migration).toContain("maintenance_work_orders_company_plan_fk");
    expect(migration).toContain("maintenance_assets_company_work_center_fk");
    expect(migration).toContain("maintenance_meter_readings_company_asset_fk");
    expect(migration).toContain("maintenance_spares_company_work_order_fk");
    expect(migration).toContain("maintenance_spares_company_stock_item_fk");
    expect(migration).toContain("references public.maintenance_assets(company_id, id)");
    expect(migration).toContain("references public.maintenance_work_orders(company_id, id)");
  });

  it("prevents negative asset values, useful life, downtime and costs", () => {
    expect(migration).toContain("maintenance_assets_nonnegative_cost_ck");
    expect(migration).toContain("useful_life_months > 0");
    expect(migration).toContain("maintenance_work_orders_nonnegative_costs_ck");
    expect(migration).toContain("downtime_minutes >= 0");
    expect(migration).toContain("labor_cost >= 0");
    expect(migration).toContain("parts_cost >= 0");
    expect(migration).toContain("other_cost >= 0");
  });

  it("requires a positive interval for active calendar/meter plans and a resolution on completion", () => {
    expect(migration).toContain("maintenance_plan_frequency_guard");
    expect(migration).toContain("new.frequency_type in ('calendar', 'meter')");
    expect(migration).toContain("maintenance_work_order_completion_guard");
    expect(migration).toContain("Maintenance work order completion requires a documented resolution");
    expect(migration).toContain("new.completed_at := coalesce(new.completed_at, now())");
  });

  it("uses staged constraints and does not rewrite or delete historical rows", () => {
    expect(migration).toMatch(/check\s*\([\s\S]*?\)\s*not valid/i);
    expect(migration).not.toMatch(/\b(update\s+public\.|delete\s+from|truncate\s+|drop\s+table)\b/i);
  });
});
