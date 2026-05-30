import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Factory,
  UserCog, CalendarCheck, Receipt, ShieldCheck, LogOut, Building2, Settings,
  MessageCircle, Package, Truck,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";

type AppRole = Database["public"]["Enums"]["app_role"];

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "sales", "production", "hr", "customer", "employee"] },
  { to: "/parties", label: "Parties", icon: Users, roles: ["admin", "sales"] },
  { to: "/invoices", label: "Invoices", icon: FileText, roles: ["admin", "sales", "customer"] },
  { to: "/sales-orders", label: "Sales Orders", icon: ShoppingCart, roles: ["admin", "sales", "customer"] },
  { to: "/boq", label: "BOQ", icon: Package, roles: ["admin", "sales", "production"] },
  { to: "/purchases", label: "Purchases", icon: Truck, roles: ["admin", "production"] },
  { to: "/production", label: "Production", icon: Factory, roles: ["admin", "production", "sales"] },
  { to: "/employees", label: "Employees", icon: UserCog, roles: ["admin", "hr"] },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck, roles: ["admin", "hr", "employee"] },
  { to: "/payslips", label: "Payslips", icon: Receipt, roles: ["admin", "hr", "employee"] },
  { to: "/approvals", label: "User Approvals", icon: ShieldCheck, roles: ["admin"] },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, roles: ["admin", "sales", "production", "hr", "customer", "employee"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
];

export function AppSidebar() {
  const { profile, roles, signOut, hasAnyRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const items = NAV.filter((n) => hasAnyRole(n.roles));

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold text-sm">MattressERP</div>
          <div className="text-xs text-sidebar-foreground/60">Manufacturing</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map((item) => {
          const active = location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4 space-y-2">
        <div className="text-xs text-sidebar-foreground/60">Signed in as</div>
        <div className="text-sm font-medium truncate">{profile?.full_name}</div>
        <div className="flex flex-wrap gap-1">
          {roles.map((r) => (
            <span key={r} className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-sidebar-accent text-sidebar-accent-foreground">
              {r}
            </span>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
