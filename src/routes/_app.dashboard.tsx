import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, ArrowRight, Boxes, Building2, CalendarClock,
  CheckCircle2, CircleDollarSign, ClipboardList, Factory, FileText, HandCoins,
  LayoutDashboard, MessageSquareText, Package, Plus, ShoppingBag, ShoppingCart, Sparkles, Truck, Users, Wallet,
} from "lucide-react";
import { formatDate, inr } from "@/lib/format";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Mattress Maestro ERP" }] }),
  component: DashboardPage,
});

type MetricResult = { value: number | null; error: boolean };
async function countRows(table: string): Promise<MetricResult> {
  try {
    const result = await supabase.from(table as never).select("id", { count: "exact", head: true });
    if (result.error) return { value: null, error: true };
    return { value: result.count ?? 0, error: false };
  } catch {
    return { value: null, error: true };
  }
}

function DashboardPage() {
  const { profile, roles, hasRole, hasAnyRole } = useAuth();
  const admin = hasRole("admin");
  const sales = hasAnyRole(["sales"]);
  const production = hasAnyRole(["production"]);
  const accountant = hasAnyRole(["accountant"]);
  const hr = hasAnyRole(["hr"]);
  const employee = hasAnyRole(["employee"]) && !admin && !hr && !accountant;
  const customer = hasAnyRole(["customer"]);
  const name = profile?.full_name?.trim().split(/\s+/)[0] || "there";

  const { data: metrics, isLoading } = useQuery({
    queryKey: ["role-dashboard-metrics", roles.slice().sort().join("|")],
    queryFn: async () => {
      const wanted = admin
        ? ["sales_orders", "parties", "invoices", "purchase_bills", "stock_items"]
        : sales
          ? ["sales_orders", "parties", "invoices"]
          : production
            ? ["sales_orders", "stock_items"]
            : accountant
              ? ["invoices", "purchase_bills", "parties"]
              : hr
                ? ["employees", "attendance"]
                : customer
                  ? ["sales_orders", "invoices"]
                  : ["attendance"];
      const pairs = await Promise.all(wanted.map(async (table) => [table, await countRows(table)] as const));
      return Object.fromEntries(pairs) as Record<string, MetricResult>;
    },
    staleTime: 60_000,
  });

  const { data: recentOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["role-dashboard-recent-orders"],
    enabled: admin || sales || production,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("id, order_number, order_date, total_amount, fulfillment_status")
        .order("order_date", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const metric = (key: string) => metrics?.[key]?.value;
  const metricError = (key: string) => metrics?.[key]?.error;
  const metricLabel = (key: string) => metricError(key) ? "Unavailable" : isLoading ? "…" : (metric(key) ?? "—").toLocaleString("en-IN");
  const title = admin ? "Business command centre" : sales ? "Sales workspace" : production ? "Production workspace" : accountant ? "Finance workspace" : hr ? "People workspace" : customer ? "Customer workspace" : "My workspace";
  const subtitle = admin
    ? "A clear, cross-department view of the business. Open a department to investigate the details."
    : sales
      ? "Your sales pipeline, customer activity and order follow-through in one place."
      : production
        ? "Keep production priorities, material availability and order progress in view."
        : accountant
          ? "Monitor financial documents and purchasing activity with your assigned access."
          : hr
            ? "People operations, attendance and workforce actions for your role."
            : customer
              ? "Follow your orders and documents from one simple workspace."
              : "Your assigned work, key shortcuts and next actions.";

  const quickLinks = admin
    ? [
        { label: "Sales & Orders", detail: "Orders, customers and invoices", to: "/sales-orders", icon: ShoppingCart },
        { label: "Purchases", detail: "Supplier and procurement activity", to: "/purchases", icon: Truck },
        { label: "Collections & Finance", detail: "Receivables, ledgers and banking", to: "/accounting", icon: HandCoins },
        { label: "B2B Customers", detail: "Parties and trade relationships", to: "/parties", icon: Building2 },
        { label: "B2C & Invoices", detail: "Customer documents and billing", to: "/invoices", icon: ShoppingBag },
        { label: "Inventory", detail: "Stock and material visibility", to: "/inventory", icon: Boxes },
        { label: "Production", detail: "Factory and order execution", to: "/production", icon: Factory },
        { label: "Reports & Intelligence", detail: "Business insights and analysis", to: "/ai/insights", icon: Activity },
        { label: "Marketing & Campaigns", detail: "Campaign budget, spend and attributable sales", to: "/marketing", icon: Activity },
        { label: "Fleet & Fuel", detail: "Vehicle register, fuel and compliance reminders", to: "/fleet", icon: Truck },
        { label: "Shipments & Delivery", detail: "Carrier status, delivery dates and proof of delivery", to: "/shipments", icon: Truck },
        { label: "Maintenance & Assets", detail: "Factory equipment and maintenance work orders", to: "/maintenance", icon: Factory },
        { label: "Quality Management", detail: "Inspections, defects and corrective actions", to: "/quality", icon: ClipboardList },
        { label: "Smart SleepTec Studio", detail: "Smart product masters, BOM revisions and engineering changes", to: "/smart-sleeptec", icon: Package },
      ]
    : sales
      ? [
          { label: "Sales Orders", detail: "Create and follow up orders", to: "/sales-orders", icon: ShoppingCart },
          { label: "Customers & Parties", detail: "Find customer records", to: "/parties", icon: Users },
          { label: "Invoices", detail: "Billing and invoice status", to: "/invoices", icon: FileText },
          { label: "Product & BOQ", detail: "Product details and quotations", to: "/boq", icon: Package },
        ]
      : production
        ? [
            { label: "Production", detail: "Factory work and execution", to: "/production", icon: Factory },
            { label: "Inventory", detail: "Materials and available stock", to: "/inventory", icon: Boxes },
            { label: "Sales Orders", detail: "Orders awaiting fulfilment", to: "/sales-orders", icon: ShoppingCart },
            { label: "Operations", detail: "Operational workbench", to: "/operations", icon: ClipboardList },
          ]
        : accountant
          ? [
              { label: "Accounting", detail: "Ledgers, vouchers and reports", to: "/accounting", icon: CircleDollarSign },
              { label: "Invoices", detail: "Billing and receivables", to: "/invoices", icon: FileText },
              { label: "Purchases", detail: "Supplier documents", to: "/purchases", icon: Truck },
              { label: "Banking", detail: "Accounts and reconciliation", to: "/banking", icon: Wallet },
            ]
          : hr
            ? [
                { label: "Employees", detail: "Employee records", to: "/employees", icon: Users },
                { label: "Attendance", detail: "Attendance and shifts", to: "/attendance", icon: CalendarClock },
                { label: "Payslips", detail: "Payroll documents", to: "/payslips", icon: FileText },
              ]
            : customer
              ? [
                  { label: "My Orders", detail: "Review order progress", to: "/sales-orders", icon: ShoppingCart },
                  { label: "My Invoices", detail: "View billing documents", to: "/invoices", icon: FileText },
                ]
              : [
                  { label: "My Attendance", detail: "Attendance and work records", to: "/attendance", icon: CalendarClock },
                  { label: "My Payslips", detail: "Available payroll documents", to: "/payslips", icon: FileText },
                ];

  const metricsForRole = admin
    ? [
        { label: "Sales orders", key: "sales_orders", icon: ShoppingCart, to: "/sales-orders" },
        { label: "Customers & parties", key: "parties", icon: Users, to: "/parties" },
        { label: "Invoices", key: "invoices", icon: FileText, to: "/invoices" },
        { label: "Purchase records", key: "purchase_bills", icon: Truck, to: "/purchases" },
        { label: "Inventory records", key: "stock_items", icon: Boxes, to: "/inventory" },
      ]
    : sales
      ? [
          { label: "Sales orders", key: "sales_orders", icon: ShoppingCart, to: "/sales-orders" },
          { label: "Customers", key: "parties", icon: Users, to: "/parties" },
          { label: "Invoices", key: "invoices", icon: FileText, to: "/invoices" },
        ]
      : production
        ? [
            { label: "Sales orders", key: "sales_orders", icon: ShoppingCart, to: "/sales-orders" },
            { label: "Inventory records", key: "stock_items", icon: Boxes, to: "/inventory" },
          ]
        : accountant
          ? [
              { label: "Invoices", key: "invoices", icon: FileText, to: "/invoices" },
              { label: "Purchase records", key: "purchase_bills", icon: Truck, to: "/purchases" },
              { label: "Parties", key: "parties", icon: Users, to: "/parties" },
            ]
          : hr
            ? [
                { label: "Employees", key: "employees", icon: Users, to: "/employees" },
                { label: "Attendance records", key: "attendance", icon: CalendarClock, to: "/attendance" },
              ]
            : customer
              ? [
                  { label: "My order records", key: "sales_orders", icon: ShoppingCart, to: "/sales-orders" },
                  { label: "Invoice records", key: "invoices", icon: FileText, to: "/invoices" },
                ]
              : [{ label: "Attendance records", key: "attendance", icon: CalendarClock, to: "/attendance" }];

  return (
    <PageBody className="space-y-6 lg:space-y-7">
      <PageHeader
        title={`Good day, ${name}`}
        description={`${title} · ${subtitle}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(admin || sales) && <Button asChild><Link to="/sales-orders"><Plus className="mr-2 h-4 w-4" />New sales order</Link></Button>}
            <Button variant="outline" asChild><Link to="/ai/insights"><Activity className="mr-2 h-4 w-4" />Insights</Link></Button>
          </div>
        }
      />

      {admin && <section aria-label="AI general manager" className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)]">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background to-background">
          <CardContent className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Founder · CEO</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Your AI general manager</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Review business performance, receivables, stock risks, production and supplier signals from the ERP. Ask follow-up questions before deciding what to do next.</p>
              </div>
            </div>
            <Button asChild className="shrink-0"><Link to="/ai/brief">Open business brief <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </CardContent>
        </Card>
        <Card className="border-border/80">
          <CardContent className="flex h-full items-center gap-3 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><MessageSquareText className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">Ask Mattress Maestro</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Question the business using permission-scoped ERP data.</p>
              <Button asChild variant="link" className="mt-1 h-auto p-0"><Link to="/ai/ask">Ask a question <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
            </div>
          </CardContent>
        </Card>
      </section>}

      <PwaInstallPrompt />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Your key metrics">
        {metricsForRole.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.key} to={item.to} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full border-border/80 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{metricLabel(item.key)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{metricError(item.key) ? "Data source not available" : "Current record count"}</p>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary"><Icon className="h-5 w-5" /></span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.9fr)]">
        <Card className="min-w-0 border-border/80">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div><CardTitle className="text-base">Department shortcuts</CardTitle><p className="mt-1 text-sm text-muted-foreground">Only the areas relevant to your role are shown here.</p></div>
            <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return <Link key={item.label} to={item.to} className="group flex min-w-0 items-start gap-3 rounded-lg border border-border/70 p-3.5 transition-colors hover:border-primary/30 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span></span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>;
            })}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-border/80">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">{admin || sales || production || customer ? "Recent sales orders" : accountant ? "Finance workspace" : hr ? "People workspace" : "Your next actions"}</CardTitle>
            <p className="text-sm text-muted-foreground">{admin ? "A quick look at the latest order activity." : "Shortcuts to continue your daily work."}</p>
          </CardHeader>
          <CardContent>
            {(admin || sales || production) ? (
              ordersLoading ? <p className="py-5 text-sm text-muted-foreground">Loading recent orders…</p> :
              recentOrders.length ? <div className="space-y-1">
                {recentOrders.map((order) => <Link key={order.id} to="/sales-orders" className="flex items-center justify-between gap-3 rounded-md px-2 py-3 hover:bg-muted/60">
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{order.order_number || "Sales order"}</span><span className="mt-1 block text-xs text-muted-foreground">{order.order_date ? formatDate(order.order_date) : "Date not recorded"}</span></span>
                  <span className="shrink-0 text-right"><span className="block text-sm font-medium tabular-nums">{inr(Number(order.total_amount || 0))}</span><Badge variant={order.fulfillment_status === "dispatched" ? "default" : "secondary"} className="mt-1">{order.fulfillment_status || "Pending status"}</Badge></span>
                </Link>)}
                <Button variant="ghost" className="mt-2 w-full justify-between" asChild><Link to="/sales-orders">Open all sales orders <ArrowRight className="h-4 w-4" /></Link></Button>
              </div> : <div className="rounded-lg border border-dashed p-5 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No recent orders to show</p><p className="mt-1 text-xs text-muted-foreground">New records will appear here when available.</p></div>
            ) : (
              <div className="space-y-3">
                {quickLinks.slice(0, 3).map((item) => { const Icon = item.icon; return <Link key={item.label} to={item.to} className="flex items-center gap-3 rounded-lg border border-border/70 p-3 hover:bg-muted/50"><Icon className="h-5 w-5 text-primary" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="block text-xs text-muted-foreground">{item.detail}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link>; })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {admin && <section className="rounded-xl border border-primary/15 bg-primary/[0.035] p-4 sm:p-5">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Activity className="h-5 w-5" /></span><div><h2 className="font-semibold">Management overview</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Use the department shortcuts above to inspect sales, purchasing, collections, B2B/B2C billing, inventory and production. Financial totals and channel-specific performance should only be added when their source records and classification rules are verified; this dashboard intentionally avoids estimating or inventing those numbers.</p></div></div>
      </section>}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
        <span>Mattress Maestro · House of Abood Tradings</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Role-based workspace</span>
      </footer>
    </PageBody>
  );
}
