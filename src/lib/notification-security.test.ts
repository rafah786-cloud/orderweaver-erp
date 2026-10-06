import { beforeEach, describe, expect, it, vi } from "vitest";

// Exercise actual handler bodies without issuing live writes or paid messages.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => { validate = fn; return builder; },
      handler: (fn: (args: any) => unknown) =>
        (args: any) => fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(), sendTemplate: vi.fn(), sendFreeform: vi.fn(), log: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.adminFrom },
}));
vi.mock("./whatsapp/log.server", () => ({ logWhatsAppNotification: mocks.log }));
vi.mock("./whatsapp/provider.server", () => ({
  getWhatsAppProvider: async () => ({
    isConfigured: () => true, sendTemplate: mocks.sendTemplate, sendFreeform: mocks.sendFreeform,
  }),
}));

import { setEventChannel, toggleEventActive } from "./notification-engine.functions";
import { notifyCustomerEvent, notifyVendorPurchaseBill } from "./whatsapp.functions";
import { notifyStaffEvent } from "./staff-notifications.functions";
import { broadcastPromo } from "./parties-admin.functions";

const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
function query(data: any, error: any = null) {
  const result = { data, error };
  const q: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
  for (const method of ["select", "eq", "in", "limit", "order", "upsert", "update"]) {
    q[method] = vi.fn(() => q);
  }
  q.maybeSingle = vi.fn(async () => result);
  return q;
}
function call(fn: unknown, data: unknown, from: any) {
  return (fn as any)({ data, context: { userId: id, supabase: { from } } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendTemplate.mockResolvedValue({ ok: true, messageId: "test" });
  mocks.sendFreeform.mockResolvedValue({ ok: true, messageId: "test" });
});

describe("admin-only notification settings", () => {
  for (const [label, fn, data] of [
    ["activation", toggleEventActive, { event_key: "invoice.issued", is_active: false }],
    ["channels", setEventChannel, { event_key: "invoice.issued", channel: "whatsapp" }],
  ] as const) {
    it(`rejects non-admin ${label} changes before any write`, async () => {
      const from = vi.fn(() => query(null));
      await expect(call(fn, data, from)).rejects.toThrow("Forbidden");
      expect(from).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith("user_roles");
    });
    it(`fails closed on role lookup errors for ${label}`, async () => {
      const from = vi.fn(() => query({ role: "admin" }, { message: "failed" }));
      await expect(call(fn, data, from)).rejects.toThrow("Forbidden");
      expect(from).toHaveBeenCalledTimes(1);
    });
    it(`allows verified admin ${label} changes as the caller`, async () => {
      const role = query({ role: "admin" });
      const write = query(null);
      const from = vi.fn((table) => table === "user_roles" ? role : write);
      await expect(call(fn, data, from)).resolves.toEqual({ ok: true });
      expect(role.eq).toHaveBeenCalledWith("user_id", id);
      expect(role.eq).toHaveBeenCalledWith("role", "admin");
      expect(write[label === "channels" ? "upsert" : "update"]).toHaveBeenCalledTimes(1);
      expect(mocks.adminFrom).not.toHaveBeenCalled();
    });
  }
});

describe("caller-scoped business reads", () => {
  beforeEach(() => mocks.adminFrom.mockImplementation((table) =>
    query(table === "user_roles" ? [{ role: "admin" }] : null)));
  it("rejects a hidden purchase bill without sending or logging", async () => {
    const from = vi.fn(() => query(null));
    await expect(call(notifyVendorPurchaseBill, { bill_id: id }, from)).rejects.toThrow();
    expect(from).toHaveBeenCalledWith("purchase_bills");
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("rejects hidden supplier enrichment even with a supplied vendor name", async () => {
    const from = vi.fn(() => query(null));
    await expect(call(notifyStaffEvent, {
      event: "staff.purchase_request.created", supplier_id: id, vars: { vendor_name: "Override" },
    }, from)).rejects.toThrow("Supplier not found");
    expect(from).toHaveBeenCalledWith("suppliers");
    expect(mocks.adminFrom).toHaveBeenCalledTimes(1);
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("resolves visible supplier enrichment without privileged supplier reads", async () => {
    const from = vi.fn(() => query({ name: "Visible supplier" }));
    await expect(call(notifyStaffEvent, {
      event: "staff.purchase_request.created", supplier_id: id,
    }, from)).resolves.toEqual({ ok: true, sent: 0, recipients: 0 });
    expect(mocks.adminFrom.mock.calls.map(([table]) => table)).not.toContain("suppliers");
  });
  for (const [event, table] of [
    ["sales_order.created", "sales_orders"], ["dispatch.update", "production_orders"],
    ["invoice.issued", "invoices"], ["payment.received", "vouchers"],
    ["ledger.statement_ready", "parties"],
  ] as const) {
    it(`rejects inaccessible ${event} references through caller RLS`, async () => {
      const q = query(null);
      const from = vi.fn(() => q);
      await expect(call(notifyCustomerEvent, { party_id: id, event, ref_id: otherId }, from)).rejects.toThrow();
      expect(from).toHaveBeenCalledWith(table);
      expect(q.eq).toHaveBeenCalledWith("id", otherId);
      expect(mocks.adminFrom.mock.calls.map(([name]) => name)).toEqual(["user_roles"]);
      expect(mocks.sendTemplate).not.toHaveBeenCalled();
      expect(mocks.log).not.toHaveBeenCalled();
    });
  }
  it("sends a visible invoice using saved content, ignoring injected variables", async () => {
    mocks.adminFrom.mockImplementation((table) => query(table === "user_roles"
      ? [{ role: "admin" }]
      : { template_name: "issued", language_code: "en", variables: ["invoice_no"], is_active: true }));
    const from = vi.fn((table) => query(table === "invoices"
      ? { id: otherId, invoice_number: "INV-1", total_amount: 10, paid_amount: 0, due_date: null }
      : { id, name: "Customer", whatsapp_number: "+919876543210", whatsapp_opt_in: true }));
    await expect(call(notifyCustomerEvent, {
      party_id: id, event: "invoice.issued", ref_id: otherId, vars: { invoice_no: "Injected" },
    }, from)).resolves.toEqual({ ok: true });
    expect(mocks.sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ bodyVariables: ["INV-1"] }));
    expect(mocks.adminFrom.mock.calls.map(([name]) => name)).not.toContain("invoices");
    expect(mocks.adminFrom.mock.calls.map(([name]) => name)).not.toContain("parties");
  });
});

describe("approved promotional broadcasts", () => {
  it("rejects missing templates before reading recipients or sending", async () => {
    mocks.adminFrom.mockImplementation((table) => query(table === "user_roles" ? { role: "admin" } : null));
    await expect(call(broadcastPromo, { audience: "parties", message: "Injected" }, vi.fn())).rejects.toThrow("No approved");
    expect(mocks.adminFrom.mock.calls.map(([name]) => name)).not.toContain("parties");
    expect(mocks.sendFreeform).not.toHaveBeenCalled();
  });
  it("uses one resolved template and only saved recipient variables", async () => {
    const template = { template_name: "approved", language_code: "en", variables: ["customer_name", "message"], is_active: true };
    const recipients = query([{ id, name: "Saved name", whatsapp_number: "+919876543210" }]);
    mocks.adminFrom.mockImplementation((table) => table === "parties" ? recipients
      : query(table === "user_roles" ? { role: "admin" } : template));
    await expect(call(broadcastPromo, { audience: "parties", message: "Injected" }, vi.fn())).resolves.toEqual({ ok: true, sent: 1, skipped: 0, total: 1 });
    expect(recipients.eq).toHaveBeenCalledWith("whatsapp_opt_in", true);
    expect(recipients.eq).toHaveBeenCalledWith("promo_opt_in", true);
    expect(mocks.sendTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateName: "approved", bodyVariables: ["Saved name", ""] }));
    expect(mocks.sendFreeform).not.toHaveBeenCalled();
    expect(mocks.adminFrom.mock.calls.filter(([name]) => name === "whatsapp_templates")).toHaveLength(1);
  });
});