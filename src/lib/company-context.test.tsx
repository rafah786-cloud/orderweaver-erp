import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
  from: vi.fn(), rpc: vi.fn(),
  getUser: vi.fn(), toastError: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useEffect: (effect: () => void) => mocks.effects.push(effect),
    useState: (initial: unknown) => {
      const setter = vi.fn(); mocks.setters.push(setter); return [initial, setter];
    },
    useMemo: (factory: () => unknown) => factory(),
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc },
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
import { CompanyProvider } from "./company-context";

const companies = [{ id: "first-company" }, { id: "selected-company" }];
function setup(savedId: string, rpcError: Error | null = null) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.rpc.mockResolvedValue({ error: rpcError });
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === "profiles" ? { active_company_id: savedId }
      : table === "user_company_access" ? companies.map((c) => ({ company_id: c.id })) : companies, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "maybeSingle", "in", "order"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  });
  CompanyProvider({ children: null });
  mocks.effects[0]?.();
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.effects.length = 0; mocks.setters.length = 0;
});
describe("active company refresh", () => {
  it("preserves a selected non-first company on reload without overwriting the account", async () => {
    setup("selected-company");
    await vi.waitFor(() => expect(mocks.setters[1]).toHaveBeenCalledWith(companies[1]));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("persists a fallback only when the saved company is inaccessible", async () => {
    setup("inaccessible-company");
    await vi.waitFor(() => expect(mocks.setters[1]).toHaveBeenCalledWith(companies[0]));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("set_active_company", { _company_id: "first-company" });
  });
  it("does not display a fallback when persisting it fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    setup("inaccessible-company", new Error("denied"));
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.setters[1]).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});