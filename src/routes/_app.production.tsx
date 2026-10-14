import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { AiInsightButton } from "@/components/ai/AiInsightButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, RefreshCw, AlertTriangle, ClipboardCheck } from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { toast } from "sonner";
import { notifyCustomerEvent } from "@/lib/whatsapp.functions";
import { notifyStaffEvent } from "@/lib/staff-notifications.functions";
import { advanceProductionOrder } from "@/lib/production-admin.functions";

type Status = "received" | "in_production" | "qc" | "ready" | "dispatched";
const STAGES: { key: Status; label: string }[] = [
  { key: "received", label: "Received" },
  { key: "in_production", label: "In Production" },
  { key: "qc", label: "QC" },
  { key: "ready", label: "Ready" },
  { key: "dispatched", label: "Dispatched" },
];
const NEXT: Record<Status, Status | null> = {
  received: "in_production",
  in_production: "qc",
  qc: "ready",
  ready: "dispatched",
  dispatched: null,
};
const STAMP: Record<Status, string | null> = {
  received: null,
  in_production: "started_at",
  qc: "qc_at",
  ready: "ready_at",
  dispatched: "dispatched_at",
};

export const Route = createFileRoute("/_app/production")({
  head: () => ({
    meta: [
      { title: "Production | Mattress Maestro ERP" },
      { name: "description", content: "Track manufacturing orders and pipeline status." },
    ],
  }), component: ProductionPage });

type Order = {
  id: string;
  production_number: string;
  status: Status;
  tracking_number: string | null;
  transporter_name: string | null;
  sales_order_id: string | null;
  sales_orders: { order_number: string; party_id: string; parties: { name: string } | null } | null;
};

function ProductionPage() {
  const { hasAnyRole } = useAuth();
  const { activeCompany, loading: companyLoading } = useCompany();
  const canAdvance = hasAnyRole(["admin", "production"]);
  const qc = useQueryClient();
  const notifyCustomer = useServerFn(notifyCustomerEvent);
  const notifyStaff = useServerFn(notifyStaffEvent);
  const advanceProductionOrderFn = useServerFn(advanceProductionOrder);

  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["production-orders", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select(
          "id, production_number, status, tracking_number, transporter_name, sales_order_id, sales_orders(order_number, party_id, parties(name))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Order[];
    },
  });

  const advance = useMutation({
    mutationFn: async (o: Order) => {
      const next = NEXT[o.status];
      if (!next) return null;
      const col = STAMP[next];
      let tracking = o.tracking_number ?? null;
      let transporter = o.transporter_name ?? null;
      if (next === "ready" || next === "dispatched") {
        tracking =
          window.prompt(`Tracking number for ${o.production_number} (optional)`, tracking ?? "") ??
          tracking;
        transporter =
          window.prompt(
            `Transporter name for ${o.production_number} (optional)`,
            transporter ?? "",
          ) ?? transporter;
      }

      await advanceProductionOrderFn({ data: {
        id: o.id, status: next,
        tracking_number: tracking || null,
        transporter_name: transporter || null,
      }});
      return { next, order: { ...o, tracking_number: tracking, transporter_name: transporter } };
    },
    onSuccess: async (res) => {
      toast.success("Production status advanced.");
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      if (!res) return;
      const partyId = res.order.sales_orders?.party_id;
      if (!partyId) return;
      if (res.next === "ready" || res.next === "dispatched") {
        try {
          const r = await notifyCustomer({
            data: {
              party_id: partyId,
              event: "dispatch.update",
              ref_id: res.order.id,
            },
          });
          if (r?.ok) toast.success("Customer notified via WhatsApp");
        } catch {
          /* non-fatal */
        }
        if (res.next === "ready")
          notifyStaff({ data: { event: "staff.dispatch.ready", ref_id: res.order.id } }).catch(
            () => {},
          );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byStage = (key: Status) => data.filter((o) => o.status === key);
  return (
    <>
      <PageHeader
        title="Production Pipeline"
        description="Move orders through Received → In Production → QC → Ready → Dispatched."
        actions={<AiInsightButton topic="production" label="Analyze production" />}
      />
      <PageBody>
        {isError && (
          <div role="alert" className="mb-4 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><span>Production orders could not be loaded: {error instanceof Error ? error.message : "Unknown error"}</span></div>
            <Button variant="outline" onClick={() => void refetch()} className="min-h-11 w-full sm:w-auto"><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
          </div>
        )}
        {!isError && (isLoading || companyLoading) && (
          <div role="status" className="mb-4 rounded-lg border p-4 text-sm text-muted-foreground">Loading production orders for {activeCompany?.display_name ?? "the active company"}…</div>
        )}
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm"><div className="font-semibold">Final quality gate</div><p className="mt-1 text-muted-foreground">Before moving an order from QC to Ready, record a passed <strong>final</strong> inspection in Quality Management. Every inspected unit must be accepted, with zero rejected units. The database enforces this gate even if a request bypasses this screen.</p></div>
        </div>
        <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1100px] gap-4 grid-cols-5">
          {STAGES.map((s) => (
            <Card key={s.key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  {s.label}
                  <span className="text-xs font-normal text-muted-foreground">
                    {byStage(s.key).length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 min-h-[120px]">
                {byStage(s.key).length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  byStage(s.key).map((o) => {
                    const next = NEXT[o.status];
                    return (
                      <div
                        key={o.id}
                        className="rounded-md border border-border bg-card p-4 text-sm space-y-3"
                      >
                        <div>
                          <div className="font-medium text-foreground">{o.production_number}</div>
                          <div className="text-muted-foreground mt-0.5">
                            {o.sales_orders?.parties?.name ?? "—"}
                          </div>
                          {o.sales_orders?.order_number && (
                            <div className="text-muted-foreground mt-0.5">
                              {o.sales_orders.order_number}
                            </div>
                          )}
                        </div>
                        {canAdvance && next && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full min-h-11 text-sm"
                            disabled={advance.isPending}
                            onClick={() => advance.mutate(o)}
                          >
                            Move to {STAGES.find((x) => x.key === next)?.label}
                            <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        </div>
      </PageBody>
    </>
  );
}
