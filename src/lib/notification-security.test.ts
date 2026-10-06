import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (args: any) => unknown) => (args: any) =>
        fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  sendTemplate: vi.fn(),
  sendFreeform: vi.fn(),
  log: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.adminFrom },
}));
vi.mock("./whatsapp/log.server", () => ({ logWhatsAppNotification: mocks.log }));
vi.mock("./whatsapp/provider.server", () => ({
  getWhatsAppProvider: async () => ({
    isConfigured: () => true,
    sendTemplate: mocks.sendTemplate,
    sendFreeform: mocks.sendFreeform,
  }),
}));

import { setEventChannel, toggleEventActive } from "./notification-engine.functions";
import { notifyCustomerEvent, notifyVendorPurchaseBill } from "./whatsapp.functions";
import { notifyStaffEvent } from "./staff-notifications.functions";
import { broadcastPromo } from "./parties-admin.functions";

const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const companyId = "00000000-0000-4000-8000-000000000003";

function query(data: any, error: any = null) {
  const result = { data, error };
  const q: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
  for (const method of ["select", "eq", "in", "limit", "order", "upsert", "update"]) {
    q[method] = vi.fn(() => q);
  }
  q.maybeSingle = vi.fn(async () => result);
  return q;
}

function call(fn: unknown, data: unknown, from: any, rpcResult = companyId) {
  const rpc = vi.fn(async (name: string) =>
    name === "current_company_id" ? { data: rpcResult, error: null } : { data: null, error: null },
  );
  return (fn as any)({ data, context: { userId: id, supabase: { from, rpc } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendTemplate.mockResolvedValue({ ok: true, messageId: "test" });
  mocks.sendFreeform.mockResolvedValue({ ok: true, messageId: "test" });
  mocks.adminFrom.mockImplementation((table: string) =>
    query(table === "employee_notification_subscriptions" ? [{ department: "Purchase" }] : null),
  );
});

describe("admin-only notification settings", () => {
  for (const [label, fn, data] of [
    ["activation", toggleEventActive, { event_key: "invoice.issued", is_active: false }],
    ["channels", setEventChannel, { event_key: "invoice.issued", channel: "whatsapp" }],
  ] as const) {
    it(`rejects non-admin ${label} changes before any write`, async () => {
      const from = vi.fn(() => query(null));
      await expect(call(fn, data, from)).rejects.toThrow("Forbidden");
      expect(from).toHaveBeenCalledWith("user_roles");
    });

    it(`fails closed on role lookup errors for ${label}`, async () => {
      const from = vi.fn(() => query({ role: "admin" }, { message: "failed" }));
      await expect(call(fn, data, from)).rejects.toThrow("Forbidden");
    });
  }
});

describe("caller-scoped notification actions", () => {
  it("rejects a hidden purchase bill before sending", async () => {
    const from = vi.fn((table: string) =>
      table === "user_roles" ? query([{ role: "admin" }]) : query(null),
    );
    await expect(call(notifyVendorPurchaseBill, { bill_id: otherId }, from)).rejects.toThrow(
      "Bill not found",
    );
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("rejects staff notification events not allowed to the caller role", async () => {
    const from = vi.fn((table: string) =>
      table === "user_roles" ? query([]) : query(null),
    );
    await expect(
      call(
        notifyStaffEvent,
        {
          event: "staff.payment.received",
          ref_id: otherId,
        },
        from,
      ),
    ).rejects.toThrow("Forbidden");
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("rejects a hidden customer reference through caller RLS", async () => {
    const from = vi.fn((table: string) =>
      table === "user_roles" ? query([{ role: "admin" }]) : query(null),
    );
    await expect(
      call(
        notifyCustomerEvent,
        {
          party_id: id,
          event: "invoice.issued",
          ref_id: otherId,
        },
        from,
      ),
    ).rejects.toThrow("Invoice does not belong");
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it("uses saved invoice data and ignores injected notification variables", async () => {
    const from = vi.fn((table: string) => {
      if (table === "user_roles") return query([{ role: "admin" }]);
      if (table === "invoices") {
        return query({
          id: otherId,
          invoice_number: "INV-1",
          total_amount: 1000,
          paid_amount: 0,
          due_date: null,
          party_id: id,
        });
      }
      if (table === "parties") {
        return query({
          id,
          name: "Customer",
          phone: "+919876543210",
          whatsapp_number: null,
          whatsapp_opt_in: true,
        });
      }
      if (table === "whatsapp_templates") {
        return query({
          template_name: "issued",
          language_code: "en",
          variables: ["invoice_no"],
          is_active: true,
        });
      }
      return query(null);
    });

    await expect(
      call(
        notifyCustomerEvent,
        {
          party_id: id,
          event: "invoice.issued",
          ref_id: otherId,
        },
        from,
      ),
    ).resolves.toEqual({ ok: true });

    expect(mocks.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ bodyVariables: ["INV-1"] }),
    );
    expect(mocks.sendFreeform).not.toHaveBeenCalled();
  });

  it("fails closed when no approved WhatsApp template exists", async () => {
    const from = vi.fn((table: string) => {
      if (table === "user_roles") return query([{ role: "admin" }]);
      if (table === "invoices")
        return query({
          id: otherId,
          invoice_number: "INV-1",
          total_amount: 1000,
          paid_amount: 0,
          due_date: null,
          party_id: id,
        });
      if (table === "parties")
        return query({
          id,
          name: "Customer",
          phone: "+919876543210",
          whatsapp_number: null,
          whatsapp_opt_in: true,
        });
      if (table === "whatsapp_templates") return query(null);
      return query(null);
    });

    await expect(
      call(notifyCustomerEvent, { party_id: id, event: "invoice.issued", ref_id: otherId }, from),
    ).resolves.toEqual({ ok: false });
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
    expect(mocks.sendFreeform).not.toHaveBeenCalled();
  });
});

describe("approved promotional broadcasts", () => {
  it("rejects missing templates before reading recipients or sending", async () => {
    mocks.adminFrom.mockImplementation((table: string) =>
      table === "user_roles" ? query({ role: "admin" }) : query(null),
    );
    await expect(call(broadcastPromo, { audience: "parties" }, vi.fn())).rejects.toThrow(
      "No approved",
    );
    expect(mocks.sendFreeform).not.toHaveBeenCalled();
  });
});
