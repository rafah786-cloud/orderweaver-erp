import { describe, expect, it } from "vitest";
import { buildSalesOrderLabelBatch } from "./build-sales-order-label-batch";

const order = { order_number: "SO-00000042", order_date: "2026-10-11" };
const lines = [
  { id: "11111111-1111-4111-8111-111111111111", model_id: "mattress-model", product_name: "Zizz Ortho", size: "78 x 72 x 6", quantity: 2, unit_price: 8500 },
  { id: "22222222-2222-4222-8222-222222222222", model_id: "pillow-model", product_name: "Pillow", size: null, quantity: 4, unit_price: 250 },
  { id: "33333333-3333-4333-8333-333333333333", model_id: "unknown-model", product_name: "Unclassified item", size: null, quantity: 1, unit_price: 100 },
];
const models = [
  { id: "mattress-model", code: "ZZ-ORTHO", label_product_kind: "mattress" },
  { id: "pillow-model", code: "ZZ-PILLOW", label_product_kind: "non_mattress" },
  { id: "unknown-model", code: "MISC", label_product_kind: "unclassified" },
];

describe("Sales Order label batch", () => {
  it("makes exactly one record per mattress unit from saved order lines", () => {
    const result = buildSalesOrderLabelBatch(order, lines, models);
    expect(result.labelCount).toBe(2);
    expect(result.records).toHaveLength(2);
    expect(result.excludedLines).toBe(2);
    expect(result.records.map((row) => row.ProductName)).toEqual(["Zizz Ortho", "Zizz Ortho"]);
    expect(result.records.map((row) => row.Model)).toEqual(["Zizz Ortho", "Zizz Ortho"]);
    expect(result.records.map((row) => row.Type)).toEqual(["MATTRESS", "MATTRESS"]);
    expect(result.records.map((row) => row.SizeIn)).toEqual(["78 x 72 x 6", "78 x 72 x 6"]);
    expect(result.records.every((row) => row.MRP === "")).toBe(true);
    expect(result.records.map((row) => row.Quantity)).toEqual(["1", "1"]);
    expect(result.records.map((row) => row.SKU)).toEqual(["ZZ-ORTHO", "ZZ-ORTHO"]);
    expect(result.records.map((row) => row.Price)).toEqual(["8500.00", "8500.00"]);
    expect(new Set(result.records.map((row) => row.Barcode)).size).toBe(2);
  });

  it("maps approved model metadata to the existing mattress template aliases without inventing MRP or manufacturing date", () => {
    const result = buildSalesOrderLabelBatch(order, [lines[0]!], [{
      ...models[0]!,
      extra_specs: { Type: "FOAM MATTRESS", SizeCm: "198 x 183 x 15", Brand: "ZIZZ" },
    }]);
    expect(result.records[0]).toMatchObject({
      Model: "Zizz Ortho",
      Type: "FOAM MATTRESS",
      SizeCm: "198 x 183 x 15",
      Brand: "ZIZZ",
      MfgDate: "",
      MRP: "",
    });
  });

  it("fails closed when every line is non-mattress or unclassified", () => {
    expect(() => buildSalesOrderLabelBatch(order, lines.slice(1), models)).toThrow(/No mattress lines/);
  });

  it("rejects fractional mattress quantities instead of rounding label counts", () => {
    expect(() => buildSalesOrderLabelBatch(order, [{ ...lines[0], quantity: 1.5 }], models)).toThrow(/fractional or invalid quantity/);
  });

  it("rejects invalid saved prices", () => {
    expect(() => buildSalesOrderLabelBatch(order, [{ ...lines[0], unit_price: Number.NaN }], models)).toThrow(/invalid saved unit price/);
  });

  it("bounds unusually large batches", () => {
    expect(() => buildSalesOrderLabelBatch(order, [{ ...lines[0], quantity: 1001 }], models)).toThrow(/more than 1,000 labels/);
  });

  it("does not guess that missing classification means mattress", () => {
    expect(() => buildSalesOrderLabelBatch(order, lines.slice(0, 1), [])).toThrow(/No mattress lines/);
  });
});
