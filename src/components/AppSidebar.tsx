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
  "/communications": MessageCircle,
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
  "/communications": "Communications",
  "/tally-import": "Tally Import",
  "/accounting": "Accounting",
  "/gst": "GST",
  "/inventory": "Inventory",
  "/banking": "Banking",
  "/vendor": "Vendor Portal",
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
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl btn-gold">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold text-base gold-text" style={{ fontFamily: "var(--font-display)" }}>Abood Tradings ERP</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/70">Manufacturing</div>
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
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all ${
                active
                  ? "bg-sidebar-active text-sidebar-active-foreground shadow-lg ring-1 ring-sidebar-active-foreground/25"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5"
              }`}
            >
              {active && <span aria-hidden className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-active-foreground" />}
              <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-sidebar-active-foreground" : "text-sidebar-foreground/85 group-hover:text-sidebar-accent-foreground"}`} />
              <span className={active ? "" : "group-hover:text-sidebar-accent-foreground"}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/70">Signed in as</div>
        <div className="text-sm font-semibold truncate text-sidebar-foreground">{profile?.full_name}</div>
        <div className="flex flex-wrap gap-1">
          {roles.map((r) => (
            <span key={r} className="bg-sidebar-accent text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full text-sidebar-accent-foreground">
              {r}
            </span>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
    <aside className="relative z-10 hidden md:flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border rounded-none">
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
        <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
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
