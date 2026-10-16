import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261016100000_accountant_invoice_read_access.sql", import.meta.url),
  "utf8",
);

describe("accountant invoice read policy alignment", () => {
  it("grants accountants read-only access to invoices and invoice lines", () => {
    expect(migration).toContain("CREATE POLICY \"inv read\" ON public.invoices");
    expect(migration).toContain("has_role(auth.uid(), 'accountant'::public.app_role)");
    expect(migration).toContain("CREATE POLICY \"invoice_items_select\" ON public.invoice_items");
    expect(migration).not.toMatch(/CREATE POLICY[^;]+FOR (INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("retains the existing sales-owner and customer-party restrictions", () => {
    expect(migration).toContain("created_by = auth.uid()");
    expect(migration).toContain("p.user_id = auth.uid()");
  });
});
