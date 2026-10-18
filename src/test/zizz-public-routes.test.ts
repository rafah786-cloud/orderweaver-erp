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
    };

    for (const [file, routeDeclaration] of Object.entries(expected)) {
      expect(existsSync(resolve(routesDir, file)), `${file} exists`).toBe(true);
      expect(source(file), `${file} declares its intended route`).toContain(routeDeclaration);
    }
  });
});
