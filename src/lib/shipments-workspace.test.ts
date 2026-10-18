import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../routes/_app.shipments.tsx", import.meta.url), "utf8");

describe("Shipment and proof-of-delivery safeguards", () => {
  it("scopes shipment/order/customer reads and shipment mutations by the active company", () => {
    expect(source).toContain('.eq("company_id",activeCompany!.id)');
    expect(source).toContain('from("shipments")');
    expect(source).toContain('from("sales_orders")');
    expect(source).toContain('from("parties")');
    expect(source).toContain('.eq("company_id",activeCompany.id)');
  });

  it("uses ordered milestones and requires POD before delivery completion", () => {
    expect(source).toContain('const NEXT: Record<string,string|null> = { draft:"packed", packed:"dispatched", dispatched:"in_transit", in_transit:"delivered"');
    expect(source).toContain("Proof-of-delivery reference is required before marking delivered.");
    expect(source).toContain("Save POD");
    expect(source).toContain('patch.delivered_at=new Date().toISOString()');
  });

  it("records item-level quantities and blocks over-shipping beyond remaining ordered quantities", () => {
    expect(source).toContain('from("sales_order_items")');
    expect(source).toContain('from("shipment_lines").insert');
    expect(source).toContain("remainingForItem(item)");
    expect(source).toContain("shipment quantity must be between zero and the remaining ordered quantity");
  });

  it("keeps shipment status separate from stock and accounting posting", () => {
    expect(source).toContain("does not silently post stock movement or invoice/accounting changes");
    expect(source).not.toContain('from("stock_movements").insert');
    expect(source).not.toContain('from("vouchers").insert');
  });
});
