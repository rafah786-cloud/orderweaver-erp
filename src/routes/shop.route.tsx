import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Shared route boundary for /shop and /shop/:slug.
 * The index page owns the catalogue; the dynamic child owns one model detail.
 * Keeping the parent layout to an Outlet prevents the catalogue from rendering
 * behind every individual mattress detail page.
 */
export const Route = createFileRoute("/shop")({
  component: ShopLayout,
});

function ShopLayout() {
  return <Outlet />;
}
