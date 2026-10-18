import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261018200000_marketing_campaign_management.sql", import.meta.url),
  "utf8",
);
const route = readFileSync(new URL("../routes/_app.marketing.tsx", import.meta.url), "utf8");

describe("Marketing campaign security and evidence contract", () => {
  it("scopes every campaign domain to company access and the active company", () => {
    expect(migration).toContain("alter table public.marketing_campaigns enable row level security");
    expect(migration).toContain("alter table public.marketing_campaign_costs enable row level security");
    expect(migration).toContain("alter table public.marketing_campaign_attributions enable row level security");
    expect(migration).toContain("company_id = public.current_company_id()");
    expect(migration).toContain("a.can_view and a.can_create");
  });

  it("prevents campaign, lead and invoice attribution across companies", () => {
    expect(migration).toContain("guard_marketing_company_links");
    expect(migration).toContain("Campaign is not in the selected company");
    expect(migration).toContain("Lead is not in the selected company");
    expect(migration).toContain("Invoice is not in the selected company");
    expect(migration).toContain("check ((lead_id is not null)::integer + (invoice_id is not null)::integer = 1)");
  });

  it("enforces unique conversion attribution and keeps attribution evidence append-only", () => {
    expect(migration).toContain("uq_marketing_campaign_lead_attribution");
    expect(migration).toContain("uq_marketing_invoice_attribution");
    expect(migration).toContain("revoke update, delete on public.marketing_campaign_attributions");
  });

  it("reports only recorded ERP leads, invoices and spend instead of fabricated channel analytics", () => {
    expect(route).toContain('from("crm_leads")');
    expect(route).toContain('select("id,lead_number,title,status,source")');
    expect(route).toContain("lead?.title");
    expect(route).toContain('from("invoices")');
    expect(route).toContain('from("marketing_campaign_costs")');
    expect(route).toContain("Spend records, not ledger postings");
    expect(route).toContain("Ad-platform impressions, clicks, cost imports");
  });
});
