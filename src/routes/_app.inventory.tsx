import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Package,
  Warehouse,
  Boxes,
  ClipboardEdit,
  ArrowLeftRight,
  AlertTriangle,
  Calculator,
} from "lucide-react";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory | Mattress Maestro ERP" },
      { name: "description", content: "Multi-godown stock management and valuation." },
    ],
  }),
  component: InventoryHome,
});

const TILES = [
  {
    to: "/inventory/items",
    label: "Stock Items",
    desc: "Items with units, HSN, valuation",
    Icon: Package,
  },
  { to: "/inventory/godowns", label: "Godowns", desc: "Warehouses & locations", Icon: Warehouse },
  {
    to: "/inventory/summary",
    label: "Stock Summary",
    desc: "Current quantity & value",
    Icon: Boxes,
  },
  {
    to: "/inventory/valuation",
    label: "Stock Valuation",
    desc: "Per-godown value by valuation method",
    Icon: Calculator,
  },
  {
    to: "/inventory/movements",
    label: "Stock Movements",
    desc: "Every in/out, drill to source",
    Icon: ArrowLeftRight,
  },
  {
    to: "/inventory/journals",
    label: "Stock Journals",
    desc: "Adjustments, transfers, consumption",
    Icon: ClipboardEdit,
  },
  {
    to: "/inventory/reorder",
    label: "Reorder Status",
    desc: "Items below reorder level",
    Icon: AlertTriangle,
  },
] as const;

function InventoryHome() {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Multi-godown stock with batches, valuation, and full drill-down."
      />
      <PageBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TILES.map(({ to, label, desc, Icon }) => (
            <Link key={to} to={to} className="group">
              <Card className="h-full transition-all group-hover:shadow-lg group-hover:-translate-y-0.5">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl btn-gold flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-base">{label}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{desc}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
