import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Factory, ClipboardCheck, Wrench, GitBranch, ShoppingCart, Warehouse, Landmark, Users, Truck, BriefcaseBusiness, Workflow, Sparkles, ShieldCheck, Database } from "lucide-react";

export const Route = createFileRoute("/_app/operations")({
  head: () => ({ meta: [
    { title: "Enterprise Operations | Mattress Maestro ERP" },
    { name: "description", content: "Global ERP capability center for planning, quality, maintenance, PLM, procurement, finance, CRM, logistics and governance." },
  ] }),
  component: EnterpriseOperations,
});

type Module = {
  key: string;
  title: string;
  description: string;
  Icon: typeof Factory;
  tables: string[];
  existingPath?: string;
};

const MODULES: Module[] = [
  { key: "planning", title: "MPS / MRP / Capacity", description: "Master scheduling, material planning, work centres, routings and operation dependencies.", Icon: Factory, tables: ["mps_plans", "mrp_runs", "work_centers", "routings"], existingPath: "/production" },
  { key: "quality", title: "Quality Management", description: "Inspection plans, in-process checks, nonconformance and CAPA control.", Icon: ClipboardCheck, tables: ["quality_plans", "quality_inspections", "quality_nonconformances"] },
  { key: "maintenance", title: "Maintenance & Assets", description: "Preventive maintenance, breakdowns, downtime, spares and asset history.", Icon: Wrench, tables: ["maintenance_assets", "maintenance_plans", "maintenance_work_orders"] },
  { key: "plm", title: "PLM / ECO / BOM Revision", description: "Effective-dated revisions, engineering changes and controlled release.", Icon: GitBranch, tables: ["bom_revisions", "engineering_change_orders"] },
  { key: "procurement", title: "Strategic Procurement", description: "RFQs, supplier quotations, scorecards, receipts and three-way matching.", Icon: ShoppingCart, tables: ["rfqs", "supplier_quotes", "supplier_scorecards", "three_way_match_results"], existingPath: "/purchases" },
  { key: "warehouse", title: "Advanced Warehouse", description: "Zones, bins, cycle counting and landed-cost allocation.", Icon: Warehouse, tables: ["warehouse_zones", "warehouse_bins", "stock_counts", "landed_cost_vouchers"], existingPath: "/inventory" },
  { key: "finance", title: "Finance Controls", description: "Budgets, bank reconciliation and fixed-asset depreciation controls.", Icon: Landmark, tables: ["budgets", "bank_reconciliations", "fixed_assets"], existingPath: "/accounting" },
  { key: "crm", title: "CRM & Pipeline", description: "Leads, opportunities, activities and weighted pipeline visibility.", Icon: Users, tables: ["crm_leads", "crm_opportunities", "crm_activities"], existingPath: "/parties" },
  { key: "logistics", title: "Logistics & Returns", description: "Shipment lifecycle, tracking, delivery and controlled sales returns.", Icon: Truck, tables: ["shipments", "sales_returns"], existingPath: "/sales-orders" },
  { key: "projects", title: "Projects & Tasks", description: "Project budgets, tasks, dependencies and execution progress.", Icon: BriefcaseBusiness, tables: ["projects", "project_tasks"] },
  { key: "workflow", title: "Workflow & Governance", description: "Versioned approval workflows, tasks, audit evidence and data-quality issues.", Icon: Workflow, tables: ["workflow_definitions", "workflow_instances", "workflow_tasks", "data_quality_issues"] },
  { key: "ai", title: "AI 2.0 Control Plane", description: "Evidence, freshness, governed intelligence and safe decision support.", Icon: Sparkles, tables: ["ai_data_freshness"], existingPath: "/ai" },
];

function EnterpriseOperations() {
  const { data: counts = {}, isLoading } = useQuery({
    queryKey: ["enterprise-capability-counts"],
    queryFn: async () => {
      const entries = await Promise.all(
        MODULES.flatMap((module) => module.tables.map(async (table) => {
          const { count, error } = await supabase.from(table as never).select("id", { count: "exact", head: true });
          if (error) throw error;
          return [table, count ?? 0] as const;
        })),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    staleTime: 30_000,
  });

  return (
    <>
      <PageHeader title="Enterprise Operations" description="The capability layer that closes the major gaps found against leading global ERPs. Existing posting, inventory and Tally controls remain authoritative." />
      <PageBody>
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card><CardContent className="flex items-center gap-3 p-5"><ShieldCheck className="h-5 w-5" /><div><div className="text-sm font-medium">Governed foundation</div><div className="text-xs text-muted-foreground">Company-scoped RLS on every new domain</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><Database className="h-5 w-5" /><div><div className="text-sm font-medium">Additive architecture</div><div className="text-xs text-muted-foreground">No replacement of canonical accounting or stock ledgers</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><Sparkles className="h-5 w-5" /><div><div className="text-sm font-medium">AI-ready</div><div className="text-xs text-muted-foreground">Freshness and evidence state are first-class controls</div></div></CardContent></Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MODULES.map((module) => {
            const Icon = module.Icon;
            const records = module.tables.reduce((sum, table) => sum + (counts[table] ?? 0), 0);
            return (
              <Card key={module.key} className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl btn-gold"><Icon className="h-5 w-5" /></div><CardTitle className="text-base">{module.title}</CardTitle></div>
                  <span className="rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{isLoading ? "Checking" : records > 0 ? "Active data" : "Ready"}</span>
                </div></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">{module.description}</p><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{isLoading ? "…" : String(records) + " records in foundation"}</span>
                  {module.existingPath && <Link to={module.existingPath} className="font-medium text-primary hover:underline">Open existing module →</Link>}
                </div></CardContent>
              </Card>
            );
          })}
        </div>
        <Card className="mt-6"><CardContent className="p-5">
          <div className="text-sm font-semibold">Production-safety rule</div>
          <p className="mt-1 text-sm text-muted-foreground">Planning, workflow, quality and analytics records are deliberately separated from posted financial and inventory transactions. Nothing in this capability foundation silently changes a posted voucher, stock movement, invoice, purchase bill or Tally migration result.</p>
        </CardContent></Card>
      </PageBody>
    </>
  );
}
