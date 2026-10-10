import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: (validate: (data: unknown) => unknown) => ({
        handler: (handler: (input: any) => unknown) => {
          const run = (input: any) => handler({ ...input, data: validate(input.data) });
          return Object.assign(run, { handler });
        },
      }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { createBankAccount } from "./banking-admin.functions";

const account = {
  name: "Operations", bank_name: "Bank", account_number: "123456",
  ifsc_code: "CODE", branch: "Branch", account_type: "current",
  currency_code: "INR", opening_balance: 100, opening_balance_date: "2026-10-10",
  ledger_account_id: "10000000-0000-4000-8000-000000000001",
};
function client(authorized = true, ledgerVisible = true) {
  const insert = vi.fn();
  const db = {
    rpc: vi.fn().mockResolvedValue({ data: "active-company", error: null }),
    from: vi.fn((table: string) => {
      const result = table === "user_roles" ? { data: authorized ? [{ role: "accountant" }] : [] }
        : table === "ledger_accounts" ? { data: ledgerVisible ? { id: account.ledger_account_id } : null }
        : { data: { id: "new-account" }, error: null };
      const chain: any = {};
      for (const method of ["select", "eq", "in", "maybeSingle", "single"]) chain[method] = vi.fn(() => chain);
      chain.insert = (row: unknown) => { insert(row); return chain; };
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    }),
  };
  return { db, insert };
}
const run = createBankAccount as unknown as ((input: any) => Promise<string>) & { handler: (input: any) => Promise<string> };

describe("bank account write allowlist", () => {
  it("preserves all form fields and binds company only from the caller context", async () => {
    const { db, insert } = client();
    expect(await run({ data: account, context: { supabase: db, userId: "accountant" } })).toBe("new-account");
    expect(insert).toHaveBeenCalledWith({ ...account, company_id: "active-company" });
  });
  it("strips unexpected fields at validation", async () => {
    const { db, insert } = client();
    await run({ data: { ...account, company_id: "other", id: "forged", is_active: false, created_at: "forged" }, context: { supabase: db, userId: "accountant" } });
    expect(insert).toHaveBeenCalledWith({ ...account, company_id: "active-company" });
  });
  it("explicitly allowlists even when unexpected data reaches the handler", async () => {
    const { db, insert } = client();
    await run.handler({ data: { ...account, company_id: "other", id: "forged", is_active: false }, context: { supabase: db, userId: "accountant" } });
    expect(insert).toHaveBeenCalledWith({ ...account, company_id: "active-company" });
  });
  it("keeps role and same-company ledger checks ahead of the write", async () => {
    for (const [authorized, ledgerVisible, message] of [[false, true, "Insufficient permissions"], [true, false, "Ledger account is outside the active company"]] as const) {
      const { db, insert } = client(authorized, ledgerVisible);
      await expect(run({ data: account, context: { supabase: db, userId: "caller" } })).rejects.toThrow(message);
      expect(insert).not.toHaveBeenCalled();
    }
  });
});