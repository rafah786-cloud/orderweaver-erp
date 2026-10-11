import test from "node:test";
import assert from "node:assert/strict";
import { formatReceipt } from "../src/format-receipt.mjs";

test("prints only customer, item names and quantities", () => {
  const output = formatReceipt({
    customerName: "ABC Furnishers",
    orderNumber: "SO-00000001",
    items: [{ item: "Zizz Ortho 6 inch", quantity: 2 }, { item: "Pillow", quantity: 4 }],
  });
  assert.equal(output, "Customer: ABC Furnishers\r\n\r\nZizz Ortho 6 inch\r\nQty: 2\r\n\r\nPillow\r\nQty: 4\r\n");
  assert.equal(output.includes("SO-00000001"), false);
  assert.equal(output.includes("₹"), false);
});

test("strips control characters and line injection from names", () => {
  const output = formatReceipt({
    customerName: "ABC\r\nINJECTED",
    items: [{ item: "Mattress\nOTHER DATA", quantity: 1 }],
  });
  assert.equal(output.includes("INJECTED\r\n"), false);
  assert.equal(output.includes("OTHER DATA\r\nQty"), false);
});

test("fails closed on invalid quantities and missing customer", () => {
  assert.throws(() => formatReceipt({ customerName: "Customer", items: [{ item: "Mattress", quantity: 0 }] }));
  assert.throws(() => formatReceipt({ customerName: "", items: [{ item: "Mattress", quantity: 1 }] }));
  assert.throws(() => formatReceipt({ customerName: "Customer", items: [] }));
});

test("bounds item count", () => {
  assert.throws(() => formatReceipt({ customerName: "Customer", items: Array.from({ length: 201 }, () => ({ item: "Mattress", quantity: 1 })) }));
});
