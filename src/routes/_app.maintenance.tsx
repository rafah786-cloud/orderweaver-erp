import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Factory, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
type Asset = {
  id: string; company_id: string; asset_code: string; asset_name: string; asset_type: string;
  serial_number: string | null; manufacturer: string | null; model_number: string | null;
  criticality: string; status: string; next_service_at: string | null;
};
type WorkOrder = {
  id: string; company_id: string; work_order_number: string; asset_id: string;
  maintenance_type: string; priority: string; status: string; reported_at: string;
  failure_code: string | null; downtime_minutes: number; labor_cost: number; parts_cost: number;
  other_cost: number; resolution: string | null; started_at: string | null; completed_at: string | null;
};
type Plan = { id: string; asset_id: string; code: string; name: string; next_due_at: string | null; active: boolean };
const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("en-IN") : "—";
const BACKLOG = new Set(["open", "assigned", "in_progress", "waiting_parts"]);

export const Route = createFileRoute("/_app/maintenance")({ component: MaintenancePage });

function MaintenancePage() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const { hasAnyRole, user } = useAuth();
  const canManage = hasAnyRole(["admin"]);
  const qc = useQueryClient();
  const [assetOpen, setAssetOpen] = useState(false);
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [completeOrder, setCompleteOrder] = useState<WorkOrder | null>(null);
  const [assetForm, setAssetForm] = useState({
    asset_code: "", asset_name: "", asset_type: "machine", serial_number: "", manufacturer: "",
    model_number: "", criticality: "medium", acquisition_cost: "0", notes: "",
  });
  const [orderForm, setOrderForm] = useState({ asset_id: "", maintenance_type: "preventive", priority: "medium", failure_code: "" });
  const [completionForm, setCompletionForm] = useState({ resolution: "", downtime_minutes: "0", labor_cost: "0", parts_cost: "0", other_cost: "0" });

  const assetsQuery = useQuery({
    queryKey: ["maintenance-assets", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company to view assets.");
      const { data, error } = await db.from("maintenance_assets").select("id,company_id,asset_code,asset_name,asset_type,serial_number,manufacturer,model_number,criticality,status,next_service_at").eq("company_id", activeCompany.id).order("asset_code");
      if (error) throw error;
      return (data ?? []) as Asset[];
    },
  });
  const ordersQuery = useQuery({
    queryKey: ["maintenance-orders", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company to view work orders.");
      const { data, error } = await db.from("maintenance_work_orders").select("id,company_id,work_order_number,asset_id,maintenance_type,priority,status,reported_at,failure_code,downtime_minutes,labor_cost,parts_cost,other_cost,resolution,started_at,completed_at").eq("company_id", activeCompany.id).order("reported_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as WorkOrder[];
    },
  });
  const plansQuery = useQuery({
    queryKey: ["maintenance-plans", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company to view planned maintenance.");
      const { data, error } = await db.from("maintenance_plans").select("id,asset_id,code,name,next_due_at,active").eq("company_id", activeCompany.id).eq("active", true);
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });
  const assetById = useMemo(() => new Map((assetsQuery.data ?? []).map(a => [a.id, a])), [assetsQuery.data]);
  const today = new Date();
  const duePlans = (plansQuery.data ?? []).filter(p => p.next_due_at && new Date(p.next_due_at) <= today);
  const openOrders = (ordersQuery.data ?? []).filter(o => BACKLOG.has(o.status));
  const loadError = assetsQuery.error || ordersQuery.error || plansQuery.error;
  const loading = companyLoading || assetsQuery.isLoading || ordersQuery.isLoading || plansQuery.isLoading;

  const createAsset = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company first.");
      if (!assetForm.asset_code.trim() || !assetForm.asset_name.trim()) throw new Error("Asset code and name are required.");
      const cost = Number(assetForm.acquisition_cost || 0);
      if (!Number.isFinite(cost) || cost < 0) throw new Error("Acquisition cost must be zero or greater.");
      const { error } = await db.from("maintenance_assets").insert({
        company_id: activeCompany.id, asset_code: assetForm.asset_code.trim().toUpperCase(),
        asset_name: assetForm.asset_name.trim(), asset_type: assetForm.asset_type,
        serial_number: assetForm.serial_number.trim() || null, manufacturer: assetForm.manufacturer.trim() || null,
        model_number: assetForm.model_number.trim() || null, criticality: assetForm.criticality,
        acquisition_cost: cost, notes: assetForm.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Asset registered.");
      setAssetOpen(false);
      setAssetForm({ asset_code: "", asset_name: "", asset_type: "machine", serial_number: "", manufacturer: "", model_number: "", criticality: "medium", acquisition_cost: "0", notes: "" });
      qc.invalidateQueries({ queryKey: ["maintenance-assets", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const createOrder = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company first.");
      if (!assetById.has(orderForm.asset_id)) throw new Error("Select an asset in the active company.");
      if (!orderForm.failure_code.trim()) throw new Error("Describe the failure, maintenance need or inspection focus.");
      const stamp = new Date().toISOString().slice(0,10).replaceAll("-","");
      const suffix = crypto.randomUUID().slice(0,8).toUpperCase();
      const { error } = await db.from("maintenance_work_orders").insert({
        company_id: activeCompany.id, work_order_number: `MWO-${stamp}-${suffix}`,
        asset_id: orderForm.asset_id, maintenance_type: orderForm.maintenance_type, priority: orderForm.priority,
        status: "open", reported_at: new Date().toISOString(), reported_by: user?.id ?? null,
        failure_code: orderForm.failure_code.trim(), downtime_minutes: 0, labor_cost: 0, parts_cost: 0, other_cost: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Maintenance work order raised.");
      setWorkOrderOpen(false);
      setOrderForm({ asset_id: "", maintenance_type: "preventive", priority: "medium", failure_code: "" });
      qc.invalidateQueries({ queryKey: ["maintenance-orders", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const changeStatus = useMutation({
    mutationFn: async (args: { order: WorkOrder; status: "in_progress" | "waiting_parts" | "cancelled" }) => {
      if (!activeCompany?.id) throw new Error("No active company.");
      const patch: Record<string, unknown> = { status: args.status };
      if (args.status === "in_progress" && !args.order.started_at) patch.started_at = new Date().toISOString();
      const { error } = await db.from("maintenance_work_orders").update(patch).eq("id", args.order.id).eq("company_id", activeCompany.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Work order updated.");
      qc.invalidateQueries({ queryKey: ["maintenance-orders", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const finishOrder = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id || !completeOrder) throw new Error("Select a work order.");
      if (!completionForm.resolution.trim()) throw new Error("Enter the repair or maintenance resolution.");
      const numeric = (v: string, label: string) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be zero or greater.`);
        return n;
      };
      const { error } = await db.from("maintenance_work_orders").update({
        status: "completed", completed_at: new Date().toISOString(), resolution: completionForm.resolution.trim(),
        downtime_minutes: numeric(completionForm.downtime_minutes, "Downtime"),
        labor_cost: numeric(completionForm.labor_cost, "Labor cost"),
        parts_cost: numeric(completionForm.parts_cost, "Parts cost"),
        other_cost: numeric(completionForm.other_cost, "Other cost"),
      }).eq("id", completeOrder.id).eq("company_id", activeCompany.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Work order completed.");
      setCompleteOrder(null);
      setCompletionForm({ resolution: "", downtime_minutes: "0", labor_cost: "0", parts_cost: "0", other_cost: "0" });
      qc.invalidateQueries({ queryKey: ["maintenance-orders", activeCompany?.id] });
      qc.invalidateQueries({ queryKey: ["maintenance-assets", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Maintenance & Assets" description={activeCompany ? `Factory assets, preventive maintenance and breakdown work orders · ${activeCompany.display_name}` : "Factory asset register and maintenance workbench"} actions={
        canManage ? <div className="flex flex-wrap gap-2">
          <Dialog open={workOrderOpen} onOpenChange={setWorkOrderOpen}>
            <DialogTrigger asChild><Button variant="outline" disabled={!assetsQuery.data?.length}><Wrench className="mr-2 h-4 w-4" />Raise work order</Button></DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Raise maintenance work order</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1"><Label>Asset</Label><Select value={orderForm.asset_id} onValueChange={value => setOrderForm(s => ({ ...s, asset_id: value }))}><SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger><SelectContent>{(assetsQuery.data ?? []).filter(a => a.status !== "retired").map(a => <SelectItem key={a.id} value={a.id}>{a.asset_code} · {a.asset_name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Work type</Label><Select value={orderForm.maintenance_type} onValueChange={value => setOrderForm(s => ({ ...s, maintenance_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="preventive">Preventive</SelectItem><SelectItem value="breakdown">Breakdown</SelectItem><SelectItem value="corrective">Corrective</SelectItem><SelectItem value="inspection">Inspection</SelectItem><SelectItem value="calibration">Calibration</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Priority</Label><Select value={orderForm.priority} onValueChange={value => setOrderForm(s => ({ ...s, priority: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="emergency">Emergency</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Failure code / maintenance need</Label><Input value={orderForm.failure_code} onChange={e => setOrderForm(s => ({ ...s, failure_code: e.target.value }))} placeholder="e.g. unusual motor vibration" /></div>
                <Button className="min-h-11" onClick={() => createOrder.mutate()} disabled={createOrder.isPending}>{createOrder.isPending ? "Saving…" : "Create work order"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Register asset</Button></DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Register machine or asset</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Asset code</Label><Input value={assetForm.asset_code} onChange={e => setAssetForm(s => ({ ...s, asset_code: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Asset name</Label><Input value={assetForm.asset_name} onChange={e => setAssetForm(s => ({ ...s, asset_name: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Asset type</Label><Input value={assetForm.asset_type} onChange={e => setAssetForm(s => ({ ...s, asset_type: e.target.value }))} placeholder="e.g. spring machine" /></div>
                <div className="space-y-1"><Label>Criticality</Label><Select value={assetForm.criticality} onValueChange={value => setAssetForm(s => ({ ...s, criticality: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Manufacturer</Label><Input value={assetForm.manufacturer} onChange={e => setAssetForm(s => ({ ...s, manufacturer: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Model number</Label><Input value={assetForm.model_number} onChange={e => setAssetForm(s => ({ ...s, model_number: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Serial number</Label><Input value={assetForm.serial_number} onChange={e => setAssetForm(s => ({ ...s, serial_number: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Acquisition cost (₹)</Label><Input type="number" min="0" step="0.01" value={assetForm.acquisition_cost} onChange={e => setAssetForm(s => ({ ...s, acquisition_cost: e.target.value }))} /></div>
                <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Input value={assetForm.notes} onChange={e => setAssetForm(s => ({ ...s, notes: e.target.value }))} /></div>
                <Button className="sm:col-span-2 min-h-11" onClick={() => createAsset.mutate()} disabled={createAsset.isPending}>{createAsset.isPending ? "Saving…" : "Save asset"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div> : undefined
      } />
      <PageBody>
        {!canManage && <div role="note" className="mb-4 rounded-lg border border-amber-300/50 bg-amber-50/50 p-3 text-sm text-amber-950 dark:bg-amber-950/10 dark:text-amber-100"><strong>Read-only for this role.</strong> The live database currently restricts writes in this workspace to approved administrators. The workspace remains visible, but editing actions are disabled until a reviewed database-policy migration is safely deployed.</div>}
        {loadError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span>Maintenance data could not be loaded. Verify company access and retry.</span></div>}
        {loading && <div role="status" className="mb-4 rounded-lg border p-4 text-sm text-muted-foreground">Loading maintenance records…</div>}
        {!loading && !loadError && <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Factory} label="Registered assets" value={String(assetsQuery.data?.length ?? 0)} />
            <Metric icon={Wrench} label="Open work orders" value={String(openOrders.length)} />
            <Metric icon={CalendarClock} label="Preventive tasks due" value={String(duePlans.length)} />
            <Metric icon={Clock3} label="Recorded downtime" value={`${(ordersQuery.data ?? []).reduce((sum,o)=>sum+Number(o.downtime_minutes||0),0).toLocaleString("en-IN")} min`} />
          </div>
          <Card className="mb-5"><CardHeader><CardTitle className="text-base">Asset register</CardTitle></CardHeader><CardContent>
            {(assetsQuery.data ?? []).length === 0 ? <p className="py-4 text-sm text-muted-foreground">No assets registered for this company yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Asset</th><th className="p-3">Type / model</th><th className="p-3">Criticality</th><th className="p-3">Status</th><th className="p-3">Next service</th></tr></thead><tbody className="divide-y">{(assetsQuery.data ?? []).map(a => <tr key={a.id}><td className="p-3"><div className="font-medium">{a.asset_code} · {a.asset_name}</div><div className="text-xs text-muted-foreground">{[a.manufacturer,a.serial_number].filter(Boolean).join(" · ") || "No manufacturer/serial captured"}</div></td><td className="p-3 capitalize">{a.asset_type}{a.model_number ? ` · ${a.model_number}` : ""}</td><td className="p-3"><Badge variant={a.criticality === "critical" || a.criticality === "high" ? "destructive" : "secondary"}>{a.criticality}</Badge></td><td className="p-3 capitalize">{a.status.replaceAll("_"," ")}</td><td className="p-3 whitespace-nowrap">{dateTime(a.next_service_at)}</td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <Card className="mb-5"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" />Preventive maintenance</CardTitle></CardHeader><CardContent>
            {(plansQuery.data ?? []).length === 0 ? <p className="py-4 text-sm text-muted-foreground">No active preventive maintenance plans are recorded.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Plan</th><th className="p-3">Asset</th><th className="p-3">Next due</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y">{(plansQuery.data ?? []).map(p => <tr key={p.id}><td className="p-3"><div className="font-medium">{p.code} · {p.name}</div></td><td className="p-3">{assetById.get(p.asset_id)?.asset_name ?? "Asset unavailable"}</td><td className="p-3 whitespace-nowrap">{dateTime(p.next_due_at)}</td><td className="p-3">{p.next_due_at && new Date(p.next_due_at) <= today ? <Badge variant="destructive">Due</Badge> : <Badge variant="secondary">Scheduled</Badge>}</td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Work orders</CardTitle></CardHeader><CardContent>
            {(ordersQuery.data ?? []).length === 0 ? <p className="py-4 text-sm text-muted-foreground">No maintenance work orders yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Work order</th><th className="p-3">Asset</th><th className="p-3">Type / priority</th><th className="p-3">Status</th><th className="p-3">Reported</th><th className="p-3">Recorded cost</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y">{(ordersQuery.data ?? []).map(o => <tr key={o.id}><td className="p-3"><div className="font-medium">{o.work_order_number}</div><div className="mt-1 text-xs text-muted-foreground">{o.failure_code ?? "No summary recorded"}</div></td><td className="p-3">{assetById.get(o.asset_id)?.asset_name ?? "Asset unavailable"}</td><td className="p-3 capitalize">{o.maintenance_type} · {o.priority}</td><td className="p-3"><Badge variant={o.status === "completed" ? "secondary" : o.priority === "emergency" ? "destructive" : "outline"}>{o.status.replaceAll("_"," ")}</Badge></td><td className="p-3 whitespace-nowrap">{dateTime(o.reported_at)}</td><td className="p-3 whitespace-nowrap">{currency(Number(o.labor_cost)+Number(o.parts_cost)+Number(o.other_cost))}</td><td className="p-3"><div className="flex gap-1">{canManage && ["open","assigned","waiting_parts"].includes(o.status) && <Button size="sm" variant="outline" onClick={() => changeStatus.mutate({order:o,status:"in_progress"})} disabled={changeStatus.isPending}>Start</Button>}{canManage && ["open","assigned","in_progress","waiting_parts"].includes(o.status) && <Button size="sm" onClick={() => {setCompleteOrder(o); setCompletionForm({resolution:o.resolution ?? "",downtime_minutes:String(o.downtime_minutes ?? 0),labor_cost:String(o.labor_cost ?? 0),parts_cost:String(o.parts_cost ?? 0),other_cost:String(o.other_cost ?? 0)});}}>Complete</Button>}</div></td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <p className="mt-3 text-xs text-muted-foreground">Maintenance costs are operational records only; they do not post to the general ledger or inventory stock ledger from this screen. Spare-part issuance and expense accounting need their canonical posting workflows.</p>
        </>}
      </PageBody>
      <Dialog open={Boolean(completeOrder)} onOpenChange={open => !open && setCompleteOrder(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Complete maintenance work order</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><Label>Resolution / repair notes</Label><Input value={completionForm.resolution} onChange={e => setCompletionForm(s => ({...s,resolution:e.target.value}))} /></div>
            <div className="space-y-1"><Label>Downtime (minutes)</Label><Input type="number" min="0" step="1" value={completionForm.downtime_minutes} onChange={e => setCompletionForm(s => ({...s,downtime_minutes:e.target.value}))} /></div>
            <div className="space-y-1"><Label>Labor cost (₹)</Label><Input type="number" min="0" step="0.01" value={completionForm.labor_cost} onChange={e => setCompletionForm(s => ({...s,labor_cost:e.target.value}))} /></div>
            <div className="space-y-1"><Label>Parts cost (₹)</Label><Input type="number" min="0" step="0.01" value={completionForm.parts_cost} onChange={e => setCompletionForm(s => ({...s,parts_cost:e.target.value}))} /></div>
            <div className="space-y-1"><Label>Other cost (₹)</Label><Input type="number" min="0" step="0.01" value={completionForm.other_cost} onChange={e => setCompletionForm(s => ({...s,other_cost:e.target.value}))} /></div>
            <Button className="sm:col-span-2 min-h-11" onClick={() => finishOrder.mutate()} disabled={finishOrder.isPending}>{finishOrder.isPending ? "Saving…" : "Complete work order"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({icon:Icon,label,value}:{icon:React.ComponentType<{className?:string}>,label:string,value:string}) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div></CardContent></Card>;
}
