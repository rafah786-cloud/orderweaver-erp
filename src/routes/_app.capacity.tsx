import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Gauge, RefreshCw, Wrench } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/lib/company-context";
import { supabase } from "@/integrations/supabase/client";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateCapacityPreview, type CapacityOperation, type CapacityRoutingOperation, type CapacityWorkCenter } from "@/lib/capacity-preview";

export const Route = createFileRoute("/_app/capacity")({
  head: () => ({ meta: [
    { title: "Capacity Preview | Mattress Maestro ERP" },
    { name: "description", content: "Read-only work-centre load preview from planned production operations." },
  ] }),
  component: CapacityPage,
});

function CapacityPage() {
  const { hasAnyRole } = useAuth();
  const { activeCompany, loading: companyLoading } = useCompany();
  const canView = hasAnyRole(["admin", "production"]);
  const query = useQuery({
    queryKey: ["capacity-preview", activeCompany?.id],
    enabled: canView && !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select an active company to calculate capacity.");
      const [operationsResponse, routingResponse, centersResponse] = await Promise.all([
        supabase.from("production_operations")
          .select("id, status, planned_qty, planned_start, planned_end, routing_operation_id")
          .eq("company_id", activeCompany.id)
          .in("status", ["pending", "ready", "running", "paused", "blocked"]),
        supabase.from("routing_operations")
          .select("id, name, work_center_id, setup_minutes, run_minutes_per_unit")
          .eq("company_id", activeCompany.id),
        supabase.from("work_centers")
          .select("id, code, name, capacity_minutes_per_day, efficiency_pct")
          .eq("company_id", activeCompany.id),
      ]);
      if (operationsResponse.error) throw operationsResponse.error;
      if (routingResponse.error) throw routingResponse.error;
      if (centersResponse.error) throw centersResponse.error;
      return calculateCapacityPreview(
        (operationsResponse.data ?? []) as CapacityOperation[],
        (routingResponse.data ?? []) as CapacityRoutingOperation[],
        (centersResponse.data ?? []) as CapacityWorkCenter[],
      );
    },
    staleTime: 15_000,
  });

  if (!canView) return <><PageHeader title="Capacity Preview" description="Access restricted." /><PageBody><div role="alert" className="rounded-lg border p-4 text-sm">Only admin and production roles can view work-centre capacity.</div></PageBody></>;

  const data = query.data;
  return <>
    <PageHeader title="Capacity Preview" description="Read-only work-centre load from active planned production operations." actions={<Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching || companyLoading} className="min-h-11"><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    <PageBody>
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm"><div className="font-semibold">Planning estimate only — no schedule changes</div><p className="mt-1 text-muted-foreground">Load is estimated as setup minutes + planned quantity × routing run minutes per unit. Only operations whose planned start and end dates fall on the same calendar date are assigned to a daily bucket. Undated or multi-day operations remain unscheduled rather than being spread using an assumed rule.</p></div>
      </div>
      {companyLoading && <div role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">Loading active company…</div>}
      {!companyLoading && !activeCompany?.id && <div role="alert" className="rounded-lg border p-4 text-sm">Select an active company to continue.</div>}
      {query.isError && <div role="alert" className="mb-4 flex flex-col gap-3 rounded-lg border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><span>Could not calculate capacity: {query.error instanceof Error ? query.error.message : "Unknown error"}</span></div><Button variant="outline" onClick={() => void query.refetch()} className="min-h-11">Retry</Button></div>}
      {query.isLoading && <div role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">Loading planned operations, routings and work centres…</div>}
      {query.isSuccess && data && <>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" />Active operations</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{data.activeOperationCount}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Gauge className="h-4 w-4" />Daily load buckets</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{data.dailyLoads.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Wrench className="h-4 w-4" />Unscheduled operations</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{data.unscheduledMinutesByWorkCenter.reduce((sum, row) => sum + row.operationCount, 0)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Needs mapping / review</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{data.unassignedOperationCount + data.invalidOperationCount}</div><p className="mt-1 text-xs text-muted-foreground">{data.unassignedOperationCount} unassigned · {data.invalidOperationCount} invalid</p></CardContent></Card>
        </div>
        {data.dailyLoads.some((row) => row.overCapacity) && <div role="alert" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><div className="font-semibold">Potential daily overload</div><p className="mt-1 text-muted-foreground">At least one work centre has estimated planned minutes above its efficiency-adjusted daily capacity. Review the routing and schedule before committing work.</p></div>}
        <Card className="mb-4"><CardHeader><CardTitle className="text-base">Scheduled daily load</CardTitle></CardHeader><CardContent>
          {data.dailyLoads.length === 0 ? <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No operations have both planned dates on the same day. Undated and multi-day operations are listed below.</div> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[700px] text-sm"><thead className="bg-muted/50"><tr className="text-left"><th className="p-3">Date</th><th className="p-3">Work centre</th><th className="p-3 text-right">Planned minutes</th><th className="p-3 text-right">Effective capacity</th><th className="p-3 text-right">Utilization</th><th className="p-3">Status</th></tr></thead><tbody>{data.dailyLoads.map((row) => <tr key={row.workCenterId + row.date} className="border-t"><td className="p-3">{row.date}</td><td className="p-3 font-medium">{row.workCenterCode ? row.workCenterCode + " — " : ""}{row.workCenterName}</td><td className="p-3 text-right tabular-nums">{Math.round(row.plannedMinutes).toLocaleString("en-IN")}</td><td className="p-3 text-right tabular-nums">{Math.round(row.effectiveCapacityMinutes).toLocaleString("en-IN")}</td><td className="p-3 text-right tabular-nums">{row.utilizationPct == null ? "Capacity not configured" : row.utilizationPct.toFixed(1) + "%"}</td><td className="p-3">{row.overCapacity ? <span className="font-medium text-destructive">Over capacity</span> : row.utilizationPct == null ? "Review capacity" : "Within capacity"}</td></tr>)}</tbody></table></div>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Unscheduled workload</CardTitle></CardHeader><CardContent>
          {data.unscheduledMinutesByWorkCenter.length === 0 ? <div className="text-sm text-muted-foreground">No undated or multi-day work is waiting for schedule allocation.</div> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[560px] text-sm"><thead className="bg-muted/50"><tr className="text-left"><th className="p-3">Work centre</th><th className="p-3 text-right">Operations</th><th className="p-3 text-right">Estimated minutes</th></tr></thead><tbody>{data.unscheduledMinutesByWorkCenter.map((row) => <tr key={row.workCenterId} className="border-t"><td className="p-3 font-medium">{row.workCenterCode ? row.workCenterCode + " — " : ""}{row.workCenterName}</td><td className="p-3 text-right">{row.operationCount}</td><td className="p-3 text-right tabular-nums">{Math.round(row.minutes).toLocaleString("en-IN")}</td></tr>)}</tbody></table></div>}
        </CardContent></Card>
        <p className="mt-3 text-xs text-muted-foreground">This preview does not create or reschedule operations, does not model setup families, queue/move time, subcontracting or multi-shift calendars, and does not replace a finite-capacity scheduler.</p>
      </>}
    </PageBody>
  </>;
}
