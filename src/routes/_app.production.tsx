import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { AiInsightButton } from "@/components/ai/AiInsightButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
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
  const canAdvance = hasAnyRole(["admin", "production"]);
  const qc = useQueryClient();
  const notifyCustomer = useServerFn(notifyCustomerEvent);
  const notifyStaff = useServerFn(notifyStaffEvent);
  const advanceProductionOrderFn = useServerFn(advanceProductionOrder);

  const { data = [] } = useQuery({
    queryKey: ["production-orders"],
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
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
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
                        className="rounded-md border border-border bg-card p-3 text-xs space-y-2"
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
                            className="w-full h-7 text-xs"
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
      </PageBody>
    </>
  );
}
