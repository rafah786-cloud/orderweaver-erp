import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  FileText,
  ShoppingCart,
  Factory,
  UserCog,
  CalendarCheck,
  Receipt,
  ShieldCheck,
  LogOut,
  Building2,
  Settings,
  MessageCircle,
  Package,
  Truck,
  Database,
  BookOpen,
  FileSpreadsheet,
  Boxes,
  Landmark,
  Menu,
  PanelLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ROUTE_ROLES } from "@/lib/permissions";
import { useState, useEffect } from "react";
import { CompanySwitcher } from "@/components/CompanySwitcher";

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
  "/ai": Sparkles,
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
  "/ai": "AI Intelligence",
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

const GROUPS = [
  { label: "Workspace", prefixes: ["/dashboard"] },
  { label: "Sales & Customers", prefixes: ["/parties", "/sales-orders", "/invoices"] },
  { label: "Purchasing & Inventory", prefixes: ["/purchases", "/inventory", "/boq"] },
  { label: "Production", prefixes: ["/production"] },
  { label: "Finance", prefixes: ["/accounting", "/banking", "/gst"] },
  { label: "People", prefixes: ["/employees", "/attendance", "/payslips"] },
  {
    label: "Automation & Admin",
    prefixes: [
      "/ai",
      "/whatsapp",
      "/communications",
      "/approvals",
      "/tally-import",
      "/vendor",
      "/settings",
    ],
  },
];

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
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.prefixes
      .map((prefix) => items.find((item) => item.to === prefix))
      .filter(Boolean) as typeof items,
  })).filter((group) => group.items.length > 0);
  const uncategorized = items.filter(
    (item) => !GROUPS.some((group) => group.prefixes.includes(item.to)),
  );

  const renderLink = (item: (typeof items)[number]) => {
    const active = location.pathname.startsWith(item.to);
    const Icon = item.icon;
    const link = (
      <Link
        to={item.to}
        onClick={onNavigate}
        className={`group relative flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out ${collapsed ? "justify-center px-2" : "gap-3"} ${active ? "bg-sidebar-active text-sidebar-active-foreground shadow-sm" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
      >
        {active && !collapsed && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-sidebar-active-foreground"
          />
        )}
        <Icon
          className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-105 ${active ? "text-sidebar-active-foreground" : "text-sidebar-foreground/85 group-hover:text-sidebar-accent-foreground"}`}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
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
  };

  return (
    <div className="flex h-full flex-col text-sidebar-foreground">
      <div
        className={`flex items-center gap-3 border-b border-sidebar-border px-5 py-4 ${collapsed ? "justify-center px-2" : ""}`}
      >
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md btn-gold">
          <Building2 className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-[1.05rem] font-semibold tracking-tight text-sidebar-foreground">
              Mattress Maestro
            </div>
            <div className="mt-1 truncate text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/55">
              Zizz Business Suite
            </div>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="ml-auto rounded-lg p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            {!collapsed && (
              <div className="mb-1.5 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">{group.items.map(renderLink)}</div>
          </section>
        ))}
        {uncategorized.length > 0 && (
          <section aria-label="Other">
            {!collapsed && (
              <div className="mb-1.5 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                Other
              </div>
            )}
            <div className="space-y-0.5">{uncategorized.map(renderLink)}</div>
          </section>
        )}
      </nav>
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 border-t border-sidebar-border p-3">
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(false)}
                className="rounded-lg p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              Expand sidebar
            </TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                onClick={async () => {
                  onNavigate?.();
                  await signOut();
                  navigate({ to: "/login" });
                }}
                className="rounded-lg p-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              Sign out
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <div className="space-y-2 border-t border-sidebar-border p-4">
          <div className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/45">
            Signed in as
          </div>
          <div className="truncate text-sm font-semibold text-sidebar-foreground">
            {profile?.full_name}
          </div>
          <div className="flex flex-wrap gap-1">
            {roles.map((r) => (
              <span
                key={r}
                className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wide text-sidebar-accent-foreground"
              >
                {r}
              </span>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={async () => {
              onNavigate?.();
              await signOut();
              navigate({ to: "/login" });
            }}
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
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true") setCollapsed(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);
  return (
    <TooltipProvider>
      <aside
        className={`relative z-10 hidden h-screen flex-col rounded-none border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out md:flex ${collapsed ? "w-16" : "w-64"}`}
      >
        <SidebarBody collapsed={collapsed} setCollapsed={setCollapsed} />
      </aside>
    </TooltipProvider>
  );
}

export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  return (
    <header className="glass sticky top-0 z-20 flex items-center justify-between gap-2 rounded-none border-0 border-b px-3 py-2 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody
            collapsed={false}
            setCollapsed={() => {}}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
      <CompanySwitcher />
      <div className="w-9" aria-hidden />
    </header>
  );
}
