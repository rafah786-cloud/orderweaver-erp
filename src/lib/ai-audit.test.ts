import { beforeEach, describe, expect, it, vi } from "vitest";
const insert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ insert }) } }));
import { logAiUsage } from "./ai/audit.server";

function caller(company: string | null, recordCompany = company, error: unknown = null) {
  const query: any = {};
  for (const method of ["select", "eq"]) query[method] = () => query;
  query.maybeSingle = async () => ({ data: { company_id: recordCompany }, error });
  return { rpc: vi.fn().mockResolvedValue({ data: company, error }), from: vi.fn(() => query) };
}
beforeEach(() => insert.mockClear());
describe("AI audit company attribution", () => {
  it("attributes to the caller's verified active company", async () => {
    await logAiUsage(caller("company-a"), { userId: "user-a", feature: "ask" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ company_id: "company-a", user_id: "user-a" }));
  });
  it("never invents a default company", async () => {
    await logAiUsage(caller(null), { userId: "user-a", feature: "ask" });
    expect(insert).not.toHaveBeenCalled();
  });
  it("rejects cross-company source attribution", async () => {
    await logAiUsage(caller("company-a", "company-b"), { userId: "user-a", feature: "ask", refTable: "invoices", refId: "invoice-b" });
    expect(insert).not.toHaveBeenCalled();
  });
  it("skips attribution on permission failures", async () => {
    await logAiUsage(caller("company-a", "company-a", { message: "denied" }), { userId: "user-a", feature: "ask" });
    expect(insert).not.toHaveBeenCalled();
  });
});