import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Factory,
  UserCog, CalendarCheck, Receipt, ShieldCheck, LogOut, Building2, Settings,
  MessageCircle, Package, Truck, Database, BookOpen, FileSpreadsheet, Boxes, Landmark,
  Menu, PanelLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

const SIDEBAR_COLLAPSED_KEY = "abood-sidebar-collapsed";

interface SidebarBodyProps {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  onNavigate?: () => void;
}

function SidebarBody({ collapsed, setCollapsed, onNavigate }: SidebarBodyProps) {
  const { profile, roles, signOut, hasAnyRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const items = NAV.filter((n) => hasAnyRole(n.roles));

  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      <div className={`flex items-center gap-3 border-b border-sidebar-border px-5 py-5 ${collapsed ? "justify-center px-2" : ""}`}>
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl btn-gold">
          <Building2 className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="gold-text truncate text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>Abood Tradings ERP</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/70">Manufacturing</div>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="ml-auto rounded-lg p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = location.pathname.startsWith(item.to);
          const Icon = item.icon;

          const link = (
            <Link
              to={item.to}
              onClick={onNavigate}
              className={`group relative flex items-center rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200 ease-out ${
                collapsed ? "justify-center px-2" : "gap-3"
              } ${
                active
                  ? "bg-sidebar-active text-sidebar-active-foreground shadow-lg ring-1 ring-sidebar-active-foreground/25"
                  : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
              }`}
            >
              {active && !collapsed && (
                <span aria-hidden className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-active-foreground" />
              )}
              <Icon
                className={`h-4 w-4 shrink-0 transition-all duration-200 group-hover:scale-110 ${
                  active ? "text-sidebar-active-foreground" : "text-sidebar-foreground/85 group-hover:text-sidebar-accent-foreground"
                }`}
              />
              {!collapsed && (
                <span className={`transition-colors duration-200 ${active ? "" : "group-hover:text-sidebar-accent-foreground"}`}>
                  {item.label}
                </span>
              )}
            </Link>
          );

          return collapsed ? (
            <Tooltip key={item.to} delayDuration={150}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={12}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div key={item.to}>{link}</div>
          );
        })}
      </nav>

      {collapsed ? (
        <div className="flex flex-col items-center gap-2 border-t border-sidebar-border p-3">
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(false)}
                className="rounded-lg p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>Expand sidebar</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                onClick={async () => { onNavigate?.(); await signOut(); navigate({ to: "/login" }); }}
                className="rounded-lg p-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>Sign out</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <div className="space-y-2 border-t border-sidebar-border p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/70">Signed in as</div>
          <div className="truncate text-sm font-semibold text-sidebar-foreground">{profile?.full_name}</div>
          <div className="flex flex-wrap gap-1">
            {roles.map((r) => (
              <span key={r} className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wide text-sidebar-accent-foreground">
                {r}
              </span>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={async () => { onNavigate?.(); await signOut(); navigate({ to: "/login" }); }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      )}
    </div>
  );
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved === "true") setCollapsed(true);
    } catch {
      // localStorage may be unavailable in some environments
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  return (
    <TooltipProvider>
      <aside
        className={`relative z-10 hidden h-screen flex-col rounded-none border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out md:flex ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarBody collapsed={collapsed} setCollapsed={setCollapsed} />
      </aside>
    </TooltipProvider>
  );
}

export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <header className="glass sticky top-0 z-20 flex items-center justify-between gap-3 rounded-none border-0 border-b border-white/10 px-3 py-2 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody collapsed={false} setCollapsed={() => {}} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg btn-gold">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="gold-text text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Abood Tradings</div>
      </div>
      <div className="w-9" aria-hidden />
    </header>
  );
}
