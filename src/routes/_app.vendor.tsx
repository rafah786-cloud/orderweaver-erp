import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, ClipboardList, BookOpen, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/vendor")({ component: VendorShell });

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/vendor", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/vendor/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { to: "/vendor/ledger", label: "Ledger", icon: BookOpen },
];

function VendorShell() {
  const { hasAnyRole, profile } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (!hasAnyRole(["vendor", "admin"])) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Vendor portal — restricted to vendor accounts.
      </div>
    );
  }

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="min-h-full">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">Supplier Portal</div>
            <div className="text-[11px] text-muted-foreground">
              Orders, purchase documents and account statement
            </div>
          </div>
          <nav
            aria-label="Supplier portal"
            className="order-3 flex w-full gap-1 overflow-x-auto pb-0.5 sm:order-none sm:w-auto sm:flex-1 sm:flex-wrap"
          >
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = n.exact
                ? location.pathname === n.to
                : location.pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden text-right sm:block">
            <div className="max-w-40 truncate text-xs font-medium text-foreground">
              {profile?.full_name ?? "Account"}
            </div>
            <div className="text-[10px] text-muted-foreground">Supplier access</div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="shrink-0">
            <LogOut className="h-4 w-4 mr-1" />
            Sign out
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <Outlet />
      </div>
    </div>
  );
}
