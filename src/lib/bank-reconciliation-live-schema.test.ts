import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261014210000_fix_bank_reconciliation_live_schema.sql", import.meta.url), "utf8");

describe("bank reconciliation migration matches the live schema", () => {
  it("scopes transaction reads and updates through the owning bank account", () => {
    expect(migration).toContain("JOIN public.bank_accounts AS ba ON ba.id = bt.bank_account_id");
    expect(migration).toContain("ba.company_id = v_company");
    expect(migration).toContain("FOR UPDATE OF bt");
    expect(migration).toContain("UPDATE public.bank_transactions AS bt");
    expect(migration).toContain("ba.id = bt.bank_account_id");
    expect(migration).toContain("public.has_role(auth.uid(),'admin'::public.app_role)");
    expect(migration).not.toMatch(/bank_transactions\s+WHERE\s+id\s*=\s*p_(?:book|statement)[\s\S]{0,80}company_id\s*=/i);
  });

  it("requires a book line and statement line with exact debit and credit matches", () => {
    expect(migration).toContain("book.source IS DISTINCT FROM 'book'");
    expect(migration).toContain("stmt.source IS DISTINCT FROM 'statement'");
    expect(migration).toContain("book.debit IS DISTINCT FROM stmt.debit");
    expect(migration).toContain("book.credit IS DISTINCT FROM stmt.credit");
  });

  it("keeps the function authenticated, role-checked, company-scoped and non-public", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("Authentication required");
    expect(migration).toContain("public.has_company_access(v_company)");
    expect(migration).toContain("Bank reconciliation access required");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.match_bank_lines(uuid,uuid) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.match_bank_lines(uuid,uuid) TO authenticated");
  });
});
