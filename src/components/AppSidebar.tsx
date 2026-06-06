import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Factory,
  UserCog, CalendarCheck, Receipt, ShieldCheck, LogOut, Building2, Settings,
  MessageCircle, Package, Truck, Database, BookOpen, FileSpreadsheet, Boxes, Landmark,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ROUTE_ROLES } from "@/lib/permissions";
import { useState, useEffect } from "react";

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
  "/tally-import": Database,
  "/accounting": BookOpen,
  "/gst": FileSpreadsheet,
  "/inventory": Boxes,
  "/banking": Landmark,
  "/vendor": Truck,
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
  "/tally-import": "Tally Import",
  "/accounting": "Accounting",
  "/gst": "GST",
  "/inventory": "Inventory",
  "/banking": "Banking",
  "/settings": "Settings",
};

const NAV = ROUTE_ROLES.map((r) => ({
  to: r.prefix,
  label: LABELS[r.prefix] ?? r.prefix,
  icon: ICONS[r.prefix] ?? LayoutDashboard,
  roles: r.roles,
}));

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, roles, signOut, hasAnyRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const items = NAV.filter((n) => hasAnyRole(n.roles));

  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
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
              onClick={onNavigate}
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
          onClick={async () => { onNavigate?.(); await signOut(); navigate({ to: "/login" }); }}
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="relative z-10 hidden md:flex h-screen w-64 flex-col glass border-0 border-r border-white/10 rounded-none">
      <SidebarBody />
    </aside>
  );
}

export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <header className="md:hidden sticky top-0 z-20 flex items-center justify-between gap-3 px-3 py-2 glass border-0 border-b border-white/10 rounded-none">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72 glass border-0 border-r border-white/10">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg btn-gold">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="font-semibold text-sm gold-text" style={{ fontFamily: "var(--font-display)" }}>Abood Tradings</div>
      </div>
      <div className="w-9" aria-hidden />
    </header>
  );
}
