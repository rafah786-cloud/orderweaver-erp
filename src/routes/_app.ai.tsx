import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";

const TABS = [
  { to: "/ai/ask", label: "Ask Maestro" },
  { to: "/ai/brief", label: "Business Brief" },
  { to: "/ai/insights", label: "Insights & Forecasts" },
  { to: "/ai/search", label: "Smart Search" },
  { to: "/ai/documents", label: "Document Reader" },
  { to: "/ai/quotations", label: "Quotation Compare" },
  { to: "/ai/proposals", label: "Proposals & Audit" },
] as const;

export const Route = createFileRoute("/_app/ai")({
  component: AiLayout,
  head: () => ({
    meta: [
      { title: "AI Intelligence | Mattress Maestro ERP" },
      {
        name: "description",
        content:
          "Ask questions of your live ERP data, review the AI business brief, spot anomalies, read invoices and compare supplier quotations.",
      },
      { property: "og:title", content: "AI Intelligence | Mattress Maestro ERP" },
      {
        property: "og:description",
        content: "Business intelligence and document automation on top of your live Mattress Maestro ERP data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AiLayout() {
  const { pathname } = useLocation();
  return (
    <div>
      <div className="border-b">
        <nav className="flex gap-1 overflow-x-auto px-4 pt-3">
          {TABS.map((t) => {
            const active = pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm ${
                  active
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
