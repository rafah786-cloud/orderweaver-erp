import { AccountingPreflightButton } from "@/components/AccountingPreflightButton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { inr, daysBetween, formatDate } from "@/lib/format";
import {
  IndianRupee,
  AlertTriangle,
  Factory,
  Users,
  ShoppingCart,
  ReceiptText,
  CalendarCheck,
  FileText,
  TrendingUp,
  Wallet,
  Upload,
  ArrowRight,
  Package,
  Gem,
  ShieldCheck,
  Leaf,
  Heart,
} from "lucide-react";
import zizz from "@/assets/brands/zizz.png.asset.json";
import softnights from "@/assets/brands/softnights.jpeg.asset.json";
import mrcoir from "@/assets/brands/mrcoir.jpeg.asset.json";
import byz from "@/assets/brands/byzbedding.jpeg.asset.json";
import ortho from "@/assets/brands/orthomedic.jpeg.asset.json";
import drspine from "@/assets/brands/drspine.jpeg.asset.json";
import zizzBedroom from "@/assets/zizz-flagship-bedroom.jpg.asset.json";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Business Dashboard | Mattress Maestro" },
      {
        name: "description",
        content:
          "Live sales, production, inventory and financial overview for House of Abood Tradings.",
      },
      { property: "og:title", content: "Business Dashboard | Mattress Maestro" },
      {
        property: "og:description",
        content:
          "Live sales, production, inventory and financial overview for House of Abood Tradings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { profile, roles, hasAnyRole, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const isSales = hasAnyRole(["sales"]);
  const isProduction = hasAnyRole(["production"]);
  const isHR = hasAnyRole(["hr"]);
  const isCustomer = hasAnyRole(["customer"]);
  const isAccountant = hasAnyRole(["accountant"]);
  const isEmployee = hasAnyRole(["employee"]) && !isAdmin && !isHR && !isAccountant;

  return (
    <>
      <AccountingPreflightButton />
      <PageBody className="dashboard-editorial space-y-8">
        <HeroSection name={profile?.full_name?.split(" ")[0] ?? ""} roles={roles} />
        <BrandShowcase />
        <WhySection />
        <QuickActions roles={roles} />
        <section aria-labelledby="business-overview" className="hoa-panel space-y-5">
          <div className="hoa-section-head">
            <p className="hoa-kicker">Mattress Maestro ERP</p>
            <h2 id="business-overview" className="hoa-title">
              Business Overview. <em>Live and Accurate.</em>
            </h2>
            <p className="hoa-sub">
              Operational intelligence across sales, production, inventory and finance.
            </p>
          </div>
          {isAdmin && <AdminPanels />}
          {isSales && !isAdmin && <SalesPanels />}
          {isProduction && !isAdmin && <ProductionPanels />}
          {isHR && !isAdmin && <HRPanels />}
          {isAccountant && !isAdmin && <AccountsPanels />}
          {isCustomer && !isAdmin && <CustomerPanels />}
          {isEmployee && <EmployeePanels />}
        </section>
        <section className="hoa-band">
          <div>
            <span className="hoa-band-rule" aria-hidden="true" />
            <h2>Premium Sleep. Healthier Lives.</h2>
            <p>House of Abood Tradings</p>
          </div>
          <a
            className="hoa-btn hoa-btn-light"
            href="https://zizzmattress.com"
            target="_blank"
            rel="noreferrer"
          >
            Contact Us <ArrowRight aria-hidden="true" />
          </a>
        </section>
        <footer className="hoa-footer">
          <strong>House of Abood Tradings</strong>
          <span>© {new Date().getFullYear()} House of Abood Tradings. All rights reserved.</span>
          <span>Mattress Maestro · Business Operations</span>
        </footer>
      </PageBody>
    </>
  );
}

const SISTER_BRANDS = [
  { name: "Zizz Mattress", descriptor: "Sleep Redefined", asset: zizz, flagship: true },
  { name: "OrthoMedic Rest", descriptor: "Orthopaedic Support", asset: ortho },
  { name: "Dr. Spine", descriptor: "Spine Care", asset: drspine },
  { name: "Mr. Coir", descriptor: "Natural Comfort", asset: mrcoir },
  { name: "Soft Nights", descriptor: "Everyday Comfort", asset: softnights },
  { name: "BYZ Bedding", descriptor: "Modern Living", asset: byz },
];

const TRUST = [
  { icon: Gem, a: "Trusted", b: "Quality" },
  { icon: ShieldCheck, a: "Comfort", b: "for Life" },
  { icon: Users, a: "Families", b: "We Serve" },
  { icon: Leaf, a: "A Healthier", b: "Tomorrow" },
];

function HeroSection({ name, roles }: { name: string; roles: string[] }) {
  return (
    <section className="hoa-hero" aria-labelledby="hoa-hero-title">
      <img
        src={zizzBedroom.url}
        alt="A Zizz bedroom designed for premium sleep"
        width={1600}
        height={1000}
        className="hoa-hero-img"
      />
      <div className="hoa-hero-veil" aria-hidden="true" />
      <div className="hoa-hero-body">
        <p className="hoa-kicker">Est. Premium Sleep &amp; Comfort</p>
        <h1 id="hoa-hero-title">
          Better Sleep
          <br />
          <em>Brighter Tomorrows</em>
        </h1>
        <p className="hoa-hero-lead">
          {name ? `Welcome back, ${name}. ` : ""}Premium sleep &amp; comfort solutions for healthier
          lives and happier homes.
          {roles.length ? ` Signed in as ${roles.join(", ")}.` : ""}
        </p>
        <div className="hoa-hero-cta">
          <a
            className="hoa-btn hoa-btn-primary"
            href="https://zizzmattress.com"
            target="_blank"
            rel="noreferrer"
          >
            Explore Our Brands <ArrowRight aria-hidden="true" />
          </a>
          <Link className="hoa-btn hoa-btn-ghost" to="/inventory">
            View Products
          </Link>
        </div>
        <ul className="hoa-trust">
          {TRUST.map(({ icon: Icon, a, b }) => (
            <li key={a}>
              <Icon aria-hidden="true" />
              <span>
                {a}
                <br />
                {b}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="hoa-hero-quote" aria-hidden="true">
        “Comfort today. A healthier tomorrow.”
      </p>
    </section>
  );
}

function BrandShowcase() {
  return (
    <section aria-labelledby="our-brands" className="hoa-panel">
      <div className="hoa-section-head hoa-center">
        <p className="hoa-kicker">Our Specialized Brands</p>
        <h2 id="our-brands" className="hoa-title">
          Different Needs. <em>A Stronger Tomorrow.</em>
        </h2>
        <p className="hoa-sub">
          A range of trusted brands, each designed to bring comfort, health and value to every home.
        </p>
      </div>
      <div className="hoa-brand-grid">
        {SISTER_BRANDS.map((brand) => (
          <article
            className={`hoa-brand-card${brand.flagship ? " is-flagship" : ""}`}
            key={brand.name}
          >
            {brand.flagship && <span className="hoa-flag">Flagship</span>}
            <div className="hoa-brand-mark">
              <img src={brand.asset.url} alt={`${brand.name} logo`} loading="lazy" />
            </div>
            <h3>{brand.name}</h3>
            <p>{brand.descriptor}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function WhySection() {
  const stats = [
    { icon: Users, big: "6", small: "Trusted Brands" },
    { icon: Package, big: "Wide", small: "Product Range" },
    { icon: ShieldCheck, big: "Reliable", small: "Supply & Support" },
    { icon: Heart, big: "Committed", small: "to Better Living" },
  ];
  return (
    <section className="hoa-panel hoa-why" aria-labelledby="hoa-why">
      <div>
        <p className="hoa-kicker">Why House of Abood Tradings</p>
        <h2 id="hoa-why" className="hoa-title">
          More Than Mattresses.
          <br />
          <em>A Healthier Tomorrow.</em>
        </h2>
        <p className="hoa-sub">
          We bring together trusted brands, quality products and a commitment to better sleep for
          every home and business.
        </p>
        <Link className="hoa-btn hoa-btn-primary" to="/parties">
          Our Customers <ArrowRight aria-hidden="true" />
        </Link>
      </div>
      <div className="hoa-stat-grid">
        {stats.map((s) => (
          <div className="hoa-stat" key={s.small}>
            <s.icon aria-hidden="true" />
            <strong>{s.big}</strong>
            <span>{s.small}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountsPanels() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        {
          to: "/accounting/trial-balance",
          title: "Trial Balance",
          text: "Review ledger balances and posting integrity.",
          icon: IndianRupee,
        },
        {
          to: "/accounting/profit-loss",
          title: "Profit & Loss",
          text: "Review income, costs and period performance.",
          icon: TrendingUp,
        },
        {
          to: "/accounting/balance-sheet",
          title: "Balance Sheet",
          text: "Review assets, liabilities and equity.",
          icon: Wallet,
        },
        {
          to: "/gst",
          title: "GST & Tax",
          text: "Returns, HSN/SAC and e-invoice controls.",
          icon: FileText,
        },
      ].map(({ to, title, text, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="group rounded-lg border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground">{title}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function QuickActions({ roles }: { roles: string[] }) {
  const isAdmin = roles.includes("admin");
  const items = [
    ...(isAdmin || roles.includes("sales")
      ? [{ to: "/sales-orders" as const, label: "Create sales order", icon: ShoppingCart }]
      : []),
    ...(isAdmin || roles.includes("sales")
      ? [{ to: "/invoices" as const, label: "Generate invoice", icon: ReceiptText }]
      : []),
    ...(isAdmin || roles.includes("production")
      ? [{ to: "/production" as const, label: "Production status", icon: Factory }]
      : []),
    ...(isAdmin ||
    roles.includes("accountant") ||
    roles.includes("production") ||
    roles.includes("sales")
      ? [{ to: "/inventory" as const, label: "Review inventory", icon: Package }]
      : []),
  ];
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="quick-actions" className="hoa-panel">
      <div className="hoa-section-head">
        <p className="hoa-kicker">Work Faster</p>
        <h2 id="quick-actions" className="hoa-title">
          Quick <em>Actions</em>
        </h2>
      </div>
      <div className="hoa-action-grid">
        {items.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="hoa-action">
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <ArrowRight aria-hidden="true" />
          </Link>
        ))}
        {isAdmin && (
          <a
            className="hoa-action"
            href="https://biz-tally-sync.lovable.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Upload aria-hidden="true" />
            <span>Tally Connect</span>
            <ArrowRight aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}

/* ------------------------------ ADMIN ------------------------------ */

function AdminPanels() {
  const { data: outstanding } = useQuery({
    queryKey: ["dash-outstanding"],
    queryFn: async () => {
      const { data, error } = await supabase.from("party_outstanding").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: production } = useQuery({
    queryKey: ["dash-production"],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_orders").select("status");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: storedBalance } = useQuery({
    queryKey: ["dash-stored-balance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parties").select("current_balance");
      if (error) throw error;
      return (data ?? []).reduce((sum, row) => sum + Number(row.current_balance ?? 0), 0);
    },
  });
  const { data: employees } = useQuery({
    queryKey: ["dash-employees"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const totalOutstanding = (outstanding ?? []).reduce((s, p) => s + Number(p.outstanding ?? 0), 0);
  const overdueCount = (outstanding ?? []).filter(
    (p) =>
      Number(p.outstanding ?? 0) >= 50000 &&
      p.oldest_unpaid_date &&
      daysBetween(p.oldest_unpaid_date) > 90,
  ).length;

  const pipeline = (production ?? []).reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  const topCustomers = (outstanding ?? [])
    .slice()
    .sort((a, b) => Number(b.outstanding ?? 0) - Number(a.outstanding ?? 0))
    .slice(0, 5);

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard label="Invoice outstanding" value={inr(totalOutstanding)} icon={IndianRupee} />
        <KpiCard
          label="Stored customer balance"
          value={inr(storedBalance ?? 0)}
          icon={IndianRupee}
        />
        <KpiCard
          label="Overdue >90d"
          value={String(overdueCount)}
          icon={AlertTriangle}
          accent="warning"
        />
        <KpiCard
          label="In Production"
          value={String(
            (pipeline.in_production ?? 0) + (pipeline.received ?? 0) + (pipeline.qc ?? 0),
          )}
          icon={Factory}
        />
        <KpiCard label="Active Employees" value={String(employees ?? 0)} icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProductionPipelineCard pipeline={pipeline} />
        <Card>
          <CardHeader>
            <CardTitle>Top customers by invoice outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-2">
                {topCustomers.map((c) => (
                  <div key={c.party_id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className="font-medium">{inr(Number(c.outstanding ?? 0))}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import Tally Master Data
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Import customers, vendors, raw materials, finished goods and ledger entries from a Tally
            XML export. Existing records are matched by GSTIN or name and updated in place.
          </p>
          <Link
            to="/tally-import"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
          >
            <Upload className="h-4 w-4" /> Open Importer
          </Link>
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------------ SALES ------------------------------ */

function SalesPanels() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  // My sales orders (RLS already restricts to created_by = me)
  const { data: myOrders = [] } = useQuery({
    queryKey: ["sales-my-orders", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("id, order_number, party_id, order_date, total_amount")
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // My invoices for collection KPIs
  const { data: myInvoices = [] } = useQuery({
    queryKey: ["sales-my-invoices", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, party_id, invoice_date, due_date, total_amount, paid_amount, status, updated_at",
        );
      if (error) throw error;
      return data ?? [];
    },
  });

  // Production status for my orders
  const orderIds = myOrders.map((o) => o.id);
  const { data: prodForMyOrders = [] } = useQuery({
    queryKey: ["sales-prod-status", orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("sales_order_id, status, updated_at")
        .in("sales_order_id", orderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Party names
  const partyIds = Array.from(
    new Set([...myOrders.map((o) => o.party_id), ...myInvoices.map((i) => i.party_id)]),
  );
  const { data: partyMap = {} } = useQuery({
    queryKey: ["sales-party-names", partyIds.join(",")],
    enabled: partyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("parties").select("id, name").in("id", partyIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p) => {
        map[p.id] = p.name;
      });
      return map;
    },
  });

  // Outstanding (RLS-scoped view); for customers we created
  const { data: outstanding = [] } = useQuery({
    queryKey: ["sales-outstanding"],
    queryFn: async () => {
      const { data, error } = await supabase.from("party_outstanding").select("*");
      if (error) throw error;
      return (data ?? []).filter((p) => Number(p.outstanding ?? 0) > 0);
    },
  });

  // KPIs
  const ordersThisMonth = myOrders.filter((o) => o.order_date >= monthStart);
  const salesThisMonth = ordersThisMonth.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const collectionsThisMonth = myInvoices
    .filter((i) => i.updated_at >= monthStart)
    .reduce((s, i) => s + Number(i.paid_amount ?? 0), 0);
  const myOutstandingTotal = outstanding.reduce((s, p) => s + Number(p.outstanding ?? 0), 0);
  const overdueCount = outstanding.filter(
    (p) => p.oldest_unpaid_date && daysBetween(p.oldest_unpaid_date) > 30,
  ).length;

  const prodByOrder = new Map(prodForMyOrders.map((p) => [p.sales_order_id, p]));
  const recentOrders = myOrders.slice(0, 8);

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard label="My Sales (this month)" value={inr(salesThisMonth)} icon={TrendingUp} />
        <KpiCard
          label="My Collections (this month)"
          value={inr(collectionsThisMonth)}
          icon={Wallet}
        />
        <KpiCard label="My Outstanding" value={inr(myOutstandingTotal)} icon={IndianRupee} />
        <KpiCard
          label="Overdue Customers"
          value={String(overdueCount)}
          icon={AlertTriangle}
          accent="warning"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>My Order Status</span>
              <Link to="/sales-orders" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Production</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      No orders yet.{" "}
                      <Link to="/sales-orders" className="text-primary hover:underline">
                        Place one
                      </Link>
                      .
                    </TableCell>
                  </TableRow>
                ) : (
                  recentOrders.map((o) => {
                    const p = prodByOrder.get(o.id);
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell className="truncate max-w-[140px]">
                          {partyMap[o.party_id] ?? "—"}
                        </TableCell>
                        <TableCell>{formatDate(o.order_date)}</TableCell>
                        <TableCell>
                          <StatusPill status={p?.status ?? "pending"} />
                        </TableCell>
                        <TableCell className="text-right">
                          {inr(Number(o.total_amount ?? 0))}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Outstanding (Aging)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Since Invoice</TableHead>
                  <TableHead className="text-right">Past Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      No outstanding balances.
                    </TableCell>
                  </TableRow>
                ) : (
                  outstanding
                    .slice()
                    .sort((a, b) => Number(b.outstanding ?? 0) - Number(a.outstanding ?? 0))
                    .slice(0, 10)
                    .map((c) => {
                      const sinceInv = c.oldest_unpaid_date
                        ? daysBetween(c.oldest_unpaid_date)
                        : null;
                      // Past due derived from earliest matching invoice's due_date (best effort)
                      const inv = myInvoices
                        .filter(
                          (i) =>
                            i.party_id === c.party_id &&
                            (i.status === "unpaid" || i.status === "partial") &&
                            Number(i.total_amount) - Number(i.paid_amount) > 0,
                        )
                        .sort((a, b) =>
                          (a.due_date ?? a.invoice_date).localeCompare(
                            b.due_date ?? b.invoice_date,
                          ),
                        )[0];
                      const pastDue = inv?.due_date ? daysBetween(inv.due_date) : null;
                      return (
                        <TableRow key={c.party_id}>
                          <TableCell className="truncate max-w-[160px]">{c.name}</TableCell>
                          <TableCell className="text-right font-medium">
                            {inr(Number(c.outstanding ?? 0))}
                          </TableCell>
                          <TableCell className="text-right">
                            {sinceInv !== null ? `${sinceInv}d` : "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right ${pastDue !== null && pastDue > 0 ? "text-warning font-medium" : ""}`}
                          >
                            {pastDue === null ? "—" : pastDue > 0 ? `${pastDue}d` : "current"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl glass-sm p-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Ready to take a new order?</div>
        <Link
          to="/sales-orders"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          <ShoppingCart className="h-4 w-4" /> New Sales Order
        </Link>
      </div>
    </>
  );
}

/* ------------------------------ PRODUCTION ------------------------------ */

function ProductionPanels() {
  const { data: production = [] } = useQuery({
    queryKey: ["prod-dash-status"],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_orders").select("status");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: lowStock = [] } = useQuery({
    queryKey: ["prod-dash-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, name, reorder_level, unit");
      if (error) throw error;
      const rows = await Promise.all(
        (data ?? []).map(async (m) => {
          // @ts-expect-error This RPC requires the unapplied accounting migration.
          const { data: onHand } = await supabase.rpc("material_on_hand", { p_material: m.id });
          return { ...m, on_hand: Number(onHand ?? 0) };
        }),
      );
      return rows.filter((m) => m.on_hand <= Number(m.reorder_level));
    },
  });

  const pipeline = production.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});
  const wip = (pipeline.in_production ?? 0) + (pipeline.received ?? 0) + (pipeline.qc ?? 0);

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard label="WIP Orders" value={String(wip)} icon={Factory} />
        <KpiCard
          label="Ready to Dispatch"
          value={String(pipeline.ready ?? 0)}
          icon={ShoppingCart}
        />
        <KpiCard label="Dispatched" value={String(pipeline.dispatched ?? 0)} icon={ReceiptText} />
        <KpiCard
          label="Low Stock Items"
          value={String(lowStock.length)}
          icon={AlertTriangle}
          accent="warning"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProductionPipelineCard pipeline={pipeline} />
        <Card>
          <CardHeader>
            <CardTitle>Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All stock levels are healthy.</p>
            ) : (
              <div className="space-y-2">
                {lowStock.slice(0, 8).map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{m.name}</span>
                    <span className="font-medium text-warning">
                      {Number(m.on_hand)} {m.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* ------------------------------ HR ------------------------------ */

function HRPanels() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: empCount = 0 } = useQuery({
    queryKey: ["hr-dash-emp"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: todayAtt = [] } = useQuery({
    queryKey: ["hr-dash-att", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("status, is_late")
        .eq("attendance_date", today);
      if (error) throw error;
      return data ?? [];
    },
  });
  const present = todayAtt.length;
  const late = todayAtt.filter((a) => a.is_late).length;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard label="Active Employees" value={String(empCount)} icon={Users} />
      <KpiCard label="Present Today" value={String(present)} icon={CalendarCheck} />
      <KpiCard label="Late Today" value={String(late)} icon={AlertTriangle} accent="warning" />
      <KpiCard label="Absent" value={String(Math.max(0, empCount - present))} icon={Users} />
    </div>
  );
}

/* ------------------------------ CUSTOMER ------------------------------ */

function CustomerPanels() {
  const { data: orders = [] } = useQuery({
    queryKey: ["cust-dash-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("id, order_number, order_date, total_amount")
        .order("order_date", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["cust-dash-inv"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, paid_amount, status, due_date, invoice_date")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const outstanding = invoices
    .filter((i) => i.status === "unpaid" || i.status === "partial")
    .reduce((s, i) => s + (Number(i.total_amount) - Number(i.paid_amount)), 0);

  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-6">
        <KpiCard label="My Orders" value={String(orders.length)} icon={ShoppingCart} />
        <KpiCard label="My Invoices" value={String(invoices.length)} icon={FileText} />
        <KpiCard
          label="Amount Due"
          value={inr(outstanding)}
          icon={IndianRupee}
          accent={outstanding > 0 ? "warning" : undefined}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.order_number}</TableCell>
                    <TableCell>{formatDate(o.order_date)}</TableCell>
                    <TableCell className="text-right">{inr(Number(o.total_amount))}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

/* ------------------------------ EMPLOYEE ------------------------------ */

function EmployeePanels() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const { data: myAtt = [] } = useQuery({
    queryKey: ["emp-dash-att"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("attendance_date, status, hours_worked, is_late")
        .gte("attendance_date", monthStart);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: payslips = [] } = useQuery({
    queryKey: ["emp-dash-pay"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("period_month, period_year, net_salary")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });
  const present = myAtt.length;
  const late = myAtt.filter((a) => a.is_late).length;
  const hours = myAtt.reduce((s, a) => s + Number(a.hours_worked ?? 0), 0);
  const latest = payslips[0];

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard label="Days Present (MTD)" value={String(present)} icon={CalendarCheck} />
      <KpiCard
        label="Late Days (MTD)"
        value={String(late)}
        icon={AlertTriangle}
        accent={late > 0 ? "warning" : undefined}
      />
      <KpiCard label="Hours Worked (MTD)" value={hours.toFixed(1)} icon={TrendingUp} />
      <KpiCard
        label="Latest Payslip"
        value={latest ? inr(Number(latest.net_salary)) : "—"}
        icon={Wallet}
      />
    </div>
  );
}

/* ------------------------------ shared ------------------------------ */

function ProductionPipelineCard({ pipeline }: { pipeline: Record<string, number> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Production Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {["received", "in_production", "qc", "ready", "dispatched"].map((s) => (
            <div key={s} className="flex items-center justify-between text-sm">
              <span className="capitalize text-muted-foreground">{s.replace("_", " ")}</span>
              <span className="font-medium">{pipeline[s] ?? 0}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    received: "bg-muted text-muted-foreground",
    in_production: "bg-primary/15 text-primary",
    qc: "bg-warning/15 text-warning",
    ready: "bg-emerald-500/15 text-emerald-500",
    dispatched: "bg-emerald-600/20 text-emerald-600",
    pending: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${map[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "warning";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div
              className={`text-2xl font-semibold mt-1 ${accent === "warning" ? "text-warning" : "text-foreground"}`}
            >
              {value}
            </div>
          </div>
          <div
            className={`h-9 w-9 rounded-md flex items-center justify-center ${accent === "warning" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
