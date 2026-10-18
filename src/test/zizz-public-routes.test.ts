import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routesDir = resolve(process.cwd(), "src/routes");
const source = (file: string) => readFileSync(resolve(routesDir, file), "utf8");

describe("Zizz public route hierarchy", () => {
  it("uses an explicit shop layout outlet rather than rendering the catalogue over model detail pages", () => {
    expect(existsSync(resolve(routesDir, "shop.route.tsx"))).toBe(true);
    expect(existsSync(resolve(routesDir, "shop.index.tsx"))).toBe(true);
    expect(existsSync(resolve(routesDir, "shop.$slug.tsx"))).toBe(true);
    expect(existsSync(resolve(routesDir, "shop.tsx"))).toBe(false);

    expect(source("shop.route.tsx")).toContain('createFileRoute("/shop")');
    expect(source("shop.route.tsx")).toContain("<Outlet />");
    expect(source("shop.index.tsx")).toContain('createFileRoute("/shop/")');
    expect(source("shop.$slug.tsx")).toContain('createFileRoute("/shop/$slug")');
  });

  it("keeps the customer-facing destination pages present", () => {
    const expected: Record<string, string> = {
      "contact.tsx": 'createFileRoute("/contact")',
      "sleep-finder.tsx": 'createFileRoute("/sleep-finder")',
      "wishlist.tsx": 'createFileRoute("/wishlist")',
      "cart.tsx": 'createFileRoute("/cart")',
      "checkout.tsx": 'createFileRoute("/checkout")',
      "api/public/website-enquiry.ts": 'createFileRoute("/api/public/website-enquiry")',
    };

    for (const [file, routeDeclaration] of Object.entries(expected)) {
      const path = resolve(routesDir, file);
      expect(existsSync(path), `${file} exists`).toBe(true);
      expect(readFileSync(path, "utf8"), `${file} declares its intended route`).toContain(routeDeclaration);
    }
  });

  it("keeps homepage hash links attached to real sections and uses GET search to reach the shop", () => {
    const home = source("index.tsx");
    const ids = new Set([...home.matchAll(/\\bid=["']([^"']+)["']/g)].map((match) => match[1]));
    const hashLinks = [...home.matchAll(/href=["']#([^"']+)["']/g)].map((match) => match[1]);

    expect(home).not.toMatch(/href=["']#["']/);
    for (const target of hashLinks) {
      expect(ids.has(target), `#${target} should point to an existing section`).toBe(true);
    }
    for (const match of home.matchAll(/hash=["']([^"']+)["']/g)) {
      expect(ids.has(match[1]), `hash ${match[1]} should point to an existing section`).toBe(true);
    }
    expect(home).toContain('action="/shop" method="get"');
    expect(home).toContain('id="shop-search" name="q"');
  });
});
