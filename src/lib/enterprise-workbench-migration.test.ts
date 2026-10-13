import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261014143000_harden_enterprise_domain_permissions.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("enterprise-domain RLS hardening migration", () => {
  it("honors separate company create, edit, and delete permissions", () => {
    expect(migration).toContain("a.can_view and a.can_create");
    expect(migration).toContain("a.can_view and a.can_edit");
    expect(migration).toContain("a.can_view and a.can_delete");
    expect(migration).toContain("public.is_approved(auth.uid())");
    expect(migration).toContain("public.current_company_id()");
  });

  it("does not rewrite legacy accounting and canonical inventory policy", () => {
    const selector = migration.split("select array_agg", 2)[1]?.split("and exists", 1)[0] ?? "";
    expect(selector).not.toContain("'vouchers'");
    expect(selector).not.toContain("'invoices'");
    expect(selector).not.toContain("'stock_movements'");
    expect(selector).toContain("'mps_plans'");
    expect(selector).toContain("'production_operations'");
  });

  it("only grants read policy on the enterprise domain audit log", () => {
    const auditBranch = migration
      .split("if v_table = 'erp_domain_audit_log' then", 2)[1]
      ?.split("else", 1)[0] ?? "";
    expect(auditBranch).toContain("for select");
    expect(auditBranch).not.toContain("for insert");
    expect(auditBranch).not.toContain("for update");
    expect(auditBranch).not.toContain("for delete");
  });

  it("drops all prior broad policies before creating granular replacements", () => {
    expect(migration).toContain("policyname like 'company_scope%'");
    expect(migration).toContain("drop policy if exists %i on public.%i");
    expect(migration).toContain("company_permission_select");
    expect(migration).toContain("company_permission_insert");
    expect(migration).toContain("company_permission_update");
    expect(migration).toContain("company_permission_delete");
  });
});
