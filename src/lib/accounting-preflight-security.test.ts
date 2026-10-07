import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ handler: (handler: unknown) => handler }),
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

import { accountingPreflight } from "./accounting-preflight.functions";

function client(fail: boolean, admin = true) {
  const diagnostic =
    "column private_secret missing at internal.database.local; SELECT secret FROM internal";
  return {
    rpc: vi.fn().mockResolvedValue({ data: "company", error: null }),
    from: vi.fn((table: string) => {
      const result =
        table === "user_roles"
          ? { data: admin ? { role: "admin" } : null, error: null }
          : {
              data: fail ? null : [],
              count: fail ? null : 0,
              error: fail ? { message: diagnostic, details: diagnostic, hint: diagnostic } : null,
            };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "limit", "range", "order", "maybeSingle"]) {
        chain[method] = vi.fn(() => chain);
      }
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    }),
  };
}

const run = accountingPreflight as unknown as (input: {
  context: { supabase: ReturnType<typeof client>; userId: string };
}) => Promise<Record<string, any>>;

describe("accounting preflight safe responses", () => {
  it("redacts every failed probe, count, sum and reconciliation query", async () => {
    const result = await run({ context: { supabase: client(true), userId: "admin" } });
    const safe = "Check unavailable. Contact your administrator for assistance.";
    for (const field of [
      "billColumns",
      "billAllocationColumns",
      "stockMovementColumns",
      "voucherSeriesError",
      "financialYearError",
    ]) {
      expect(result[field]).toBe(safe);
    }
    for (const field of [
      "vouchers",
      "entries",
      "bills",
      "billAllocations",
      "purchases",
      "stockMovements",
      "customerOutstanding",
      "supplierOutstanding",
      "invoicePaid",
      "invoiceTotal",
      "rawMaterialStockQuantity",
    ]) {
      expect(result[field].error).toBe(safe);
    }
    expect(result.invoiceOutstanding).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(
      /private_secret|internal\.database|SELECT|details|hint/,
    );
  });

  it("preserves successful read-only results", async () => {
    const result = await run({ context: { supabase: client(false), userId: "admin" } });
    expect(result.billColumns).toBe("columns present");
    expect(result.bills).toEqual({ count: 0, error: null });
    expect(result.invoiceOutstanding).toBe(0);
    expect(result.vouchers.error).toBeNull();
  });

  it("still denies non-admin callers before business reads", async () => {
    const db = client(false, false);
    await expect(run({ context: { supabase: db, userId: "staff" } })).rejects.toThrow("Admin only");
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
