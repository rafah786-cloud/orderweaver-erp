import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";

const TABS = [
  { to: "/communications/events",                 label: "Events" },
  { to: "/communications/providers",              label: "Providers" },
  { to: "/communications/templates",              label: "Templates" },
  { to: "/communications/employee-subscriptions", label: "Staff Subscriptions" },
  { to: "/communications/whatsapp-logs",          label: "Activity Log" },
  { to: "/communications/inbox",                  label: "My Inbox" },
] as const;

export const Route = createFileRoute("/_app/communications")({
  component: CommunicationsLayout,
});

function CommunicationsLayout() {
  const { pathname } = useLocation();
  return (
    <div>
      <div className="border-b">
        <nav className="flex gap-1 px-4 pt-3 overflow-x-auto">
          {TABS.map((t) => {
            const active = pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`px-3 py-2 text-sm rounded-t-md whitespace-nowrap border-b-2 ${
                  active
                    ? "border-primary text-primary font-medium"
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
