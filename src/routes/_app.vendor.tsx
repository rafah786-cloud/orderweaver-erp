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
      <div className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="font-semibold">Vendor Portal</div>
          <nav className="flex gap-1 flex-1 flex-wrap">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = n.exact ? location.pathname === n.to : location.pathname.startsWith(n.to);
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
          <div className="text-xs text-muted-foreground">{profile?.full_name ?? profile?.email}</div>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" />Sign out</Button>
        </div>
      </div>
      <div className="mx-auto max-w-6xl p-4">
        <Outlet />
      </div>
    </div>
  );
}
