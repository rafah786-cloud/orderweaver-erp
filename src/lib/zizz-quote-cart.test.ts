import { describe, expect, it } from "vitest";
import {
  addZizzQuoteItem,
  clearZizzQuoteCart,
  normalizeZizzQuoteCart,
  readZizzQuoteCart,
  removeZizzQuoteItem,
  setZizzQuoteQuantity,
  ZIZZ_QUOTE_CART_STORAGE_KEY,
} from "./zizz-quote-cart";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("Zizz quote cart", () => {
  it("accepts only known draft models and safe quantities", () => {
    expect(
      normalizeZizzQuoteCart([
        { slug: "htf", quantity: 2 },
        { slug: "htf", quantity: 3 },
        { slug: "unknown-model", quantity: 1 },
        { slug: "royal", quantity: 0 },
        { slug: "edge", quantity: 11 },
      ]),
    ).toEqual([
      { slug: "htf", quantity: 5 },
    ]);
  });

  it("adds a model once and keeps the selection in storage", () => {
    const storage = memoryStorage();
    expect(addZizzQuoteItem("htf", storage)).toEqual([{ slug: "htf", quantity: 1 }]);
    expect(addZizzQuoteItem("htf", storage)).toEqual([{ slug: "htf", quantity: 1 }]);
    expect(storage.getItem(ZIZZ_QUOTE_CART_STORAGE_KEY)).toContain('"slug":"htf"');
    expect(readZizzQuoteCart(storage)).toEqual([{ slug: "htf", quantity: 1 }]);
  });

  it("supports quantity changes, removal, and clearing", () => {
    const storage = memoryStorage();
    addZizzQuoteItem("htf", storage);
    addZizzQuoteItem("royal", storage);
    expect(setZizzQuoteQuantity("htf", 4, storage)).toEqual([
      { slug: "htf", quantity: 4 },
      { slug: "royal", quantity: 1 },
    ]);
    expect(setZizzQuoteQuantity("htf", 11, storage)).toHaveLength(2);
    expect(removeZizzQuoteItem("royal", storage)).toEqual([{ slug: "htf", quantity: 4 }]);
    expect(clearZizzQuoteCart(storage)).toEqual([]);
    expect(readZizzQuoteCart(storage)).toEqual([]);
  });

  it("fails closed on malformed stored data", () => {
    const storage = memoryStorage();
    storage.setItem(ZIZZ_QUOTE_CART_STORAGE_KEY, "{not-json");
    expect(readZizzQuoteCart(storage)).toEqual([]);
  });

  it("does not add unknown models", () => {
    const storage = memoryStorage();
    expect(addZizzQuoteItem("invented-model", storage)).toEqual([]);
  });
});
