import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, TrendingUp, Boxes, Factory, Wallet, Truck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/ai/Markdown";
import { getBusinessBrief } from "@/lib/ai.functions";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_app/ai/brief")({ component: BriefPage });

interface Snapshot {
  sales: { netRevenue: number; invoiceCount: number; revenueChangePct: number | null; period: { from: string; to: string } };
  inventory: { totals: { materials: number; belowReorder: number; stockOutRisk: number; overstock: number; dormant: number } };
  production: { orders: number; materialMovement: { wastagePct: number | null; variancePct: number | null } };
  receivables: { totalOutstanding: number; ageing: Record<string, number> };
  suppliers: { increases: { material: string; changePct: number | null }[] };
  profitability: { totals: { revenue: number; materialCost: number } };
  anomalies: { area: string; severity: string; title: string; detail: string }[];
  forecast: { sufficientData: boolean; revenueForecast: number[] };
}

const LEGEND = [
  { label: "Actual", desc: "Recorded in the ERP" },
  { label: "Calculated", desc: "Computed from ERP records" },
  { label: "Forecast", desc: "Statistical estimate" },
  { label: "Interpretation", desc: "AI reading of the data" },
  { label: "Recommendation", desc: "AI suggestion — needs your decision" },
];

function BriefPage() {
  const qc = useQueryClient();
  const brief = useServerFn(getBusinessBrief);

  const { data, isPending, error } = useQuery({
    queryKey: ["ai-brief"],
    queryFn: () => brief({ data: {} }),
    staleTime: 5 * 60 * 1000,
  });

  const refresh = useMutation({
    mutationFn: () => brief({ data: { refresh: true } }),
    onSuccess: (res) => qc.setQueryData(["ai-brief"], res),
  });

  const snapshot = (data as { snapshot?: Snapshot } | undefined)?.snapshot;
  const narrative = (data as { narrative?: string } | undefined)?.narrative ?? "";
  const aiError = (data as { aiError?: string | null } | undefined)?.aiError ?? null;

  return (
    <div>
      <PageHeader
        title="AI Business Brief"
        description="A management view across sales, profitability, inventory, production, receivables and suppliers — built from live ERP data."
        actions={
          <Button onClick={() => refresh.mutate()} disabled={refresh.isPending} variant="outline" size="sm">
            {refresh.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      <PageBody>
        {isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculating your business metrics…
          </div>
        )}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {snapshot && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Metric icon={TrendingUp} label="Revenue (30 days)" value={inr(snapshot.sales.netRevenue)} sub={
                snapshot.sales.revenueChangePct != null ? `${snapshot.sales.revenueChangePct > 0 ? "+" : ""}${snapshot.sales.revenueChangePct}% vs previous` : "No comparison"
              } />
              <Metric icon={TrendingUp} label="Invoices" value={String(snapshot.sales.invoiceCount)} sub="Last 30 days" />
              <Metric icon={Boxes} label="Stock alerts" value={String(snapshot.inventory.totals.belowReorder)} sub={`${snapshot.inventory.totals.stockOutRisk} at stock-out risk`} />
              <Metric icon={Factory} label="Production orders" value={String(snapshot.production.orders)} sub={
                snapshot.production.materialMovement.wastagePct != null ? `${snapshot.production.materialMovement.wastagePct}% wastage` : "Wastage not measurable"
              } />
              <Metric icon={Wallet} label="Receivables" value={inr(snapshot.receivables.totalOutstanding)} sub={`${inr(snapshot.receivables.ageing["90+"] ?? 0)} over 90 days`} />
              <Metric icon={Truck} label="Price increases" value={String(snapshot.suppliers.increases.length)} sub="Materials costing more" />
            </div>

            {snapshot.anomalies.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Detected anomalies
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {snapshot.anomalies.map((a, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                      <Badge variant={a.severity === "high" ? "destructive" : "secondary"} className="mt-0.5 capitalize">
                        {a.severity}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.detail}</p>
                      </div>
                      <Badge variant="outline" className="ml-auto capitalize">{a.area}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Management narrative</CardTitle>
                <div className="flex flex-wrap gap-2 pt-1">
                  {LEGEND.map((l) => (
                    <Badge key={l.label} variant="outline" className="text-[10px]" title={l.desc}>
                      {l.label}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {aiError ? (
                  <p className="text-sm text-muted-foreground">
                    The figures above are live and correct. The written summary is unavailable right now: {aiError}
                  </p>
                ) : (
                  <Markdown>{narrative}</Markdown>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <p className="mt-1 text-xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
