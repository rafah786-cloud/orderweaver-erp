const STORAGE_KEY = "zizz:mattress-wishlist";
const CHANGE_EVENT = "zizz-wishlist-change";

export function readZizzWishlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function toggleZizzWishlist(slug: string): string[] {
  const current = readZizzWishlist();
  const next = current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage restrictions should not break browsing.
  }
  return next;
}

export function subscribeZizzWishlist(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
