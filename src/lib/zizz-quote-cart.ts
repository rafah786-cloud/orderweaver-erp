import { mattressModels } from "@/lib/zizz-store-catalog";

export type ZizzQuoteCartItem = {
  slug: string;
  quantity: number;
};

type QuoteStorage = Pick<Storage, "getItem" | "setItem">;

export const ZIZZ_QUOTE_CART_STORAGE_KEY = "zizz:quote-cart";
const CHANGE_EVENT = "zizz-quote-cart-change";
const knownSlugs = new Set(mattressModels.map((model) => model.slug));

function browserStorage(): QuoteStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function normalizeZizzQuoteCart(value: unknown): ZizzQuoteCartItem[] {
  if (!Array.isArray(value)) return [];
  const quantities = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { slug?: unknown; quantity?: unknown };
    if (
      typeof candidate.slug !== "string" ||
      !knownSlugs.has(candidate.slug) ||
      typeof candidate.quantity !== "number" ||
      !Number.isInteger(candidate.quantity) ||
      candidate.quantity < 1 ||
      candidate.quantity > 10
    ) {
      continue;
    }
    quantities.set(candidate.slug, Math.min(10, (quantities.get(candidate.slug) ?? 0) + candidate.quantity));
  }
  return [...quantities].map(([slug, quantity]) => ({ slug, quantity }));
}

export function readZizzQuoteCart(storage: QuoteStorage | null = browserStorage()): ZizzQuoteCartItem[] {
  if (!storage) return [];
  try {
    return normalizeZizzQuoteCart(JSON.parse(storage.getItem(ZIZZ_QUOTE_CART_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function persist(items: ZizzQuoteCartItem[], storage: QuoteStorage | null): ZizzQuoteCartItem[] {
  const normalized = normalizeZizzQuoteCart(items);
  try {
    storage?.setItem(ZIZZ_QUOTE_CART_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Browsing and enquiry flows must remain available if local storage is blocked.
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Storage restrictions should not break the page.
    }
  }
  return normalized;
}

/** Add a model to the enquiry list once; quantity is adjusted in the list itself. */
export function addZizzQuoteItem(slug: string, storage: QuoteStorage | null = browserStorage()): ZizzQuoteCartItem[] {
  if (!knownSlugs.has(slug)) return readZizzQuoteCart(storage);
  const items = readZizzQuoteCart(storage);
  if (items.some((item) => item.slug === slug)) return items;
  return persist([...items, { slug, quantity: 1 }], storage);
}

export function setZizzQuoteQuantity(
  slug: string,
  quantity: number,
  storage: QuoteStorage | null = browserStorage(),
): ZizzQuoteCartItem[] {
  if (!knownSlugs.has(slug) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return readZizzQuoteCart(storage);
  }
  const items = readZizzQuoteCart(storage);
  if (!items.some((item) => item.slug === slug)) return items;
  return persist(items.map((item) => (item.slug === slug ? { ...item, quantity } : item)), storage);
}

export function removeZizzQuoteItem(slug: string, storage: QuoteStorage | null = browserStorage()): ZizzQuoteCartItem[] {
  return persist(readZizzQuoteCart(storage).filter((item) => item.slug !== slug), storage);
}

export function clearZizzQuoteCart(storage: QuoteStorage | null = browserStorage()): ZizzQuoteCartItem[] {
  return persist([], storage);
}

export function subscribeZizzQuoteCart(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
