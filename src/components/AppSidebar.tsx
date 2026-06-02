import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Factory,
  UserCog, CalendarCheck, Receipt, ShieldCheck, LogOut, Building2, Settings,
  MessageCircle, Package, Truck, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTE_ROLES } from "@/lib/permissions";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/dashboard": LayoutDashboard,
  "/parties": Users,
  "/invoices": FileText,
  "/sales-orders": ShoppingCart,
  "/boq": Package,
  "/purchases": Truck,
  "/production": Factory,
  "/employees": UserCog,
  "/attendance": CalendarCheck,
  "/payslips": Receipt,
  "/approvals": ShieldCheck,
  "/whatsapp": MessageCircle,
  "/settings": Settings,
};

const LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/parties": "Parties",
  "/invoices": "Invoices",
  "/sales-orders": "Sales Orders",
  "/boq": "BOQ",
  "/purchases": "Purchases",
  "/production": "Production",
  "/employees": "Employees",
  "/attendance": "Attendance",
  "/payslips": "Payslips",
  "/approvals": "User Approvals",
  "/whatsapp": "WhatsApp",
  "/settings": "Settings",
};

const NAV = ROUTE_ROLES.map((r) => ({
  to: r.prefix,
  label: LABELS[r.prefix] ?? r.prefix,
  icon: ICONS[r.prefix] ?? LayoutDashboard,
  roles: r.roles,
}));

export function AppSidebar() {
  const { profile, roles, signOut, hasAnyRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const items = NAV.filter((n) => hasAnyRole(n.roles));

  return (
    <aside className="relative z-10 flex h-screen w-64 flex-col text-sidebar-foreground glass border-0 border-r border-white/10 rounded-none">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl btn-gold">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold text-base gold-text" style={{ fontFamily: "var(--font-display)" }}>Abood Tradings ERP</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/50">Manufacturing</div>
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
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_1px_0_oklch(1_0_0/.15)_inset,0_-1px_0_oklch(0_0_0/.25)_inset,0_8px_18px_-8px_oklch(0.80_0.14_85/.35)]"
                  : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-sidebar-foreground hover:translate-x-0.5"
              }`}
            >
              {active && <span aria-hidden className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full" style={{ background: "var(--gradient-gold)" }} />}
              <Icon className={`h-4 w-4 ${active ? "text-[oklch(0.92_0.10_85)]" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/50">Signed in as</div>
        <div className="text-sm font-medium truncate">{profile?.full_name}</div>
        <div className="flex flex-wrap gap-1">
          {roles.map((r) => (
            <span key={r} className="glass-sm text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full text-sidebar-accent-foreground">
              {r}
            </span>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
