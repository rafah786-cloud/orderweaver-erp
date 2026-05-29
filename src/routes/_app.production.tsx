import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STAGES = [
  { key: "received", label: "Received" },
  { key: "in_production", label: "In Production" },
  { key: "qc", label: "QC" },
  { key: "ready", label: "Ready" },
  { key: "dispatched", label: "Dispatched" },
];

export const Route = createFileRoute("/_app/production")({
  component: ProductionPage,
});

function ProductionPage() {
  const { data } = useQuery({
    queryKey: ["production-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("id, production_number, status, sales_order_id, created_at, sales_orders(order_number, party_id, parties(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const byStage = (key: string) => (data ?? []).filter((o) => o.status === key);

  return (
    <>
      <PageHeader title="Production Pipeline" description="Live status of production orders." />
      <PageBody>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
          {STAGES.map((s) => (
            <Card key={s.key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  {s.label}
                  <span className="text-xs font-normal text-muted-foreground">{byStage(s.key).length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 min-h-[120px]">
                {byStage(s.key).length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : byStage(s.key).map((o) => (
                  <div key={o.id} className="rounded-md border border-border bg-card p-3 text-xs">
                    <div className="font-medium text-foreground">{o.production_number}</div>
                    <div className="text-muted-foreground mt-1">
                      {(o as any).sales_orders?.parties?.name ?? "—"}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Status transitions and drill-down ship in Phase 3.
        </p>
      </PageBody>
    </>
  );
}
