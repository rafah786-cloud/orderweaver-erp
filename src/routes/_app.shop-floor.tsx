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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Factory, ListChecks, Play, Plus, Timer } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
type ProductionOrder = { id: string; company_id: string; production_number: string; status: string; created_at: string };
type Routing = { id: string; company_id: string; code: string; name: string; revision: string; status: string; effective_from: string | null; effective_to: string | null };
type RoutingOperation = { id: string; company_id: string; routing_id: string; operation_no: number; operation_code: string; name: string; work_center_id: string | null; setup_minutes: number; run_minutes_per_unit: number; mandatory_qc: boolean };
type WorkCenter = { id: string; code: string; name: string; department: string | null };
type Operation = { id: string; company_id: string; production_order_id: string; routing_operation_id: string | null; sequence_no: number; status: string; planned_start: string | null; actual_start: string | null; actual_end: string | null; planned_qty: number; good_qty: number; scrap_qty: number; rework_qty: number; setup_minutes: number; run_minutes: number; downtime_minutes: number; notes: string | null };
type Inspection = { id: string; production_order_id: string | null; stage: string; status: string };
const q = (v: number) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const when = (v: string | null) => v ? new Date(v).toLocaleString("en-IN") : "—";
const ACTIVE = new Set(["ready", "running", "paused", "blocked"]);

export const Route = createFileRoute("/_app/shop-floor")({ component: ShopFloorPage });

function ShopFloorPage() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const { hasAnyRole, user } = useAuth();
  const canManage = hasAnyRole(["admin"]);
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [finishOp, setFinishOp] = useState<Operation | null>(null);
  const [createForm, setCreateForm] = useState({ orderId: "", routingId: "", qty: "1", startAt: "", notes: "" });
  const [finishForm, setFinishForm] = useState({ good: "", scrap: "0", rework: "0", setup: "0", run: "0", downtime: "0", notes: "" });

  const orders = useQuery({
    queryKey: ["shop-floor-orders", activeCompany?.id], enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("production_orders").select("id,company_id,production_number,status,created_at")
        .eq("company_id", activeCompany!.id).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as ProductionOrder[];
    },
  });
  const routings = useQuery({
    queryKey: ["shop-floor-routings", activeCompany?.id], enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("routings").select("id,company_id,code,name,revision,status,effective_from,effective_to")
        .eq("company_id", activeCompany!.id).eq("status", "approved").order("name").limit(1000);
      if (error) throw error;
      return (data ?? []) as Routing[];
    },
  });
  const routeOps = useQuery({
    queryKey: ["shop-floor-template-ops", activeCompany?.id], enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("routing_operations").select("id,company_id,routing_id,operation_no,operation_code,name,work_center_id,setup_minutes,run_minutes_per_unit,mandatory_qc")
        .eq("company_id", activeCompany!.id).order("operation_no").limit(5000);
      if (error) throw error;
      return (data ?? []) as RoutingOperation[];
    },
  });
  const centers = useQuery({
    queryKey: ["shop-floor-centers", activeCompany?.id], enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("work_centers").select("id,code,name,department")
        .eq("company_id", activeCompany!.id).eq("active", true).order("name").limit(1000);
      if (error) throw error;
      return (data ?? []) as WorkCenter[];
    },
  });
  const operations = useQuery({
    queryKey: ["shop-floor-operations", activeCompany?.id], enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("production_operations")
        .select("id,company_id,production_order_id,routing_operation_id,sequence_no,status,planned_start,actual_start,actual_end,planned_qty,good_qty,scrap_qty,rework_qty,setup_minutes,run_minutes,downtime_minutes,notes")
        .eq("company_id", activeCompany!.id).order("production_order_id").order("sequence_no").limit(5000);
      if (error) throw error;
      return (data ?? []) as Operation[];
    },
  });
  const inspections = useQuery({
    queryKey: ["shop-floor-passed-qc", activeCompany?.id], enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("quality_inspections").select("id,production_order_id,stage,status")
        .eq("company_id", activeCompany!.id).eq("status", "passed").eq("stage", "in_process").limit(2000);
      if (error) throw error;
      return (data ?? []) as Inspection[];
    },
  });

  const orderById = useMemo(() => new Map((orders.data ?? []).map(x => [x.id, x])), [orders.data]);
  const routingById = useMemo(() => new Map((routings.data ?? []).map(x => [x.id, x])), [routings.data]);
  const routeOpById = useMemo(() => new Map((routeOps.data ?? []).map(x => [x.id, x])), [routeOps.data]);
  const centerById = useMemo(() => new Map((centers.data ?? []).map(x => [x.id, x])), [centers.data]);
  const opsByOrder = useMemo(() => {
    const map = new Map<string, Operation[]>();
    for (const op of operations.data ?? []) map.set(op.production_order_id, [...(map.get(op.production_order_id) ?? []), op]);
    for (const rows of map.values()) rows.sort((a,b)=>a.sequence_no-b.sequence_no);
    return map;
  }, [operations.data]);
  const templateOps = (routeOps.data ?? []).filter(x => x.routing_id === createForm.routingId).slice().sort((a,b)=>a.operation_no-b.operation_no);
  const running = (operations.data ?? []).filter(x=>x.status==="running").length;
  const open = (operations.data ?? []).filter(x=>ACTIVE.has(x.status)).length;
  const downtime = (operations.data ?? []).reduce((sum,x)=>sum+Number(x.downtime_minutes||0),0);
  const loading = companyLoading || orders.isLoading || routings.isLoading || routeOps.isLoading || centers.isLoading || operations.isLoading || inspections.isLoading;
  const loadError = orders.error || routings.error || routeOps.error || centers.error || operations.error || inspections.error;

  const generate = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select an active company.");
      const order = orderById.get(createForm.orderId);
      const routing = routingById.get(createForm.routingId);
      if (!order || !routing) throw new Error("Choose a production order and an approved routing in this company.");
      if ((opsByOrder.get(order.id) ?? []).length) throw new Error("Operations already exist for this order; duplicate routing generation is blocked.");
      const today = new Date().toISOString().slice(0,10);
      if ((routing.effective_from && routing.effective_from > today) || (routing.effective_to && routing.effective_to < today)) throw new Error("The selected routing is not effective today.");
      const steps = templateOps;
      if (!steps.length) throw new Error("The selected routing has no operation lines.");
      const plannedQty = Number(createForm.qty);
      if (!Number.isFinite(plannedQty) || plannedQty <= 0) throw new Error("Planned quantity must be positive.");
      const payload = steps.map(step => ({
        company_id: activeCompany.id, production_order_id: order.id, routing_operation_id: step.id,
        sequence_no: step.operation_no, status: "pending", planned_qty: plannedQty,
        setup_minutes: Number(step.setup_minutes || 0),
        run_minutes: Number(step.run_minutes_per_unit || 0) * plannedQty,
        planned_start: createForm.startAt ? new Date(createForm.startAt).toISOString() : null,
        operator_id: user?.id ?? null, notes: createForm.notes.trim() || null,
      }));
      const { error } = await db.from("production_operations").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Operation records generated.");
      setCreateOpen(false);
      setCreateForm({ orderId: "", routingId: "", qty: "1", startAt: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["shop-floor-operations", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setOperationStatus = useMutation({
    mutationFn: async (args: { op: Operation; next: "running" | "paused" | "blocked" }) => {
      if (!activeCompany?.id || !canManage) throw new Error("Production management permission is required.");
      const op = args.op;
      if (!["pending","ready","paused","running","blocked"].includes(op.status)) throw new Error("Completed or cancelled operations cannot be changed.");
      const previous = (opsByOrder.get(op.production_order_id) ?? []).filter(x=>x.sequence_no < op.sequence_no && x.status!=="completed" && x.status!=="cancelled");
      if (args.next === "running" && previous.length) throw new Error("A preceding operation must be completed or formally cancelled first.");
      const patch: Record<string, unknown> = { status: args.next };
      if (args.next==="running" && !op.actual_start) patch.actual_start = new Date().toISOString();
      const { error } = await db.from("production_operations").update(patch)
        .eq("id",op.id).eq("company_id",activeCompany.id).eq("status",op.status);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Operation status updated.");
      qc.invalidateQueries({ queryKey: ["shop-floor-operations", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id || !finishOp) throw new Error("Select an operation.");
      if (!["running","paused"].includes(finishOp.status)) throw new Error("Only running or paused operations can be completed.");
      if (!finishForm.good.trim()) throw new Error("Good output quantity is required.");
      const nums = [Number(finishForm.good),Number(finishForm.scrap),Number(finishForm.rework),Number(finishForm.setup),Number(finishForm.run),Number(finishForm.downtime)];
      if (nums.some(v=>!Number.isFinite(v)||v<0)) throw new Error("Output quantities and time must be non-negative numbers.");
      if (Math.abs(nums[0]+nums[1]+nums[2]-Number(finishOp.planned_qty))>0.0001) throw new Error("Good + scrap + rework must equal the planned quantity before completing the operation.");
      const template = finishOp.routing_operation_id ? routeOpById.get(finishOp.routing_operation_id) : undefined;
      if (template?.mandatory_qc && !(inspections.data ?? []).some(i=>i.production_order_id===finishOp.production_order_id)) throw new Error("This operation requires a passed in-process QC inspection for the production order.");
      const { error } = await db.from("production_operations").update({
        status:"completed", actual_end:new Date().toISOString(), good_qty:nums[0], scrap_qty:nums[1],
        rework_qty:nums[2], setup_minutes:nums[3], run_minutes:nums[4], downtime_minutes:nums[5],
        notes:finishForm.notes.trim() || finishOp.notes,
      }).eq("id",finishOp.id).eq("company_id",activeCompany.id).in("status",["running","paused"]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Operation output recorded.");
      setFinishOp(null);
      setFinishForm({ good:"", scrap:"0", rework:"0", setup:"0", run:"0", downtime:"0", notes:"" });
      qc.invalidateQueries({ queryKey:["shop-floor-operations",activeCompany?.id] });
    },
    onError: (e:Error)=>toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Shop Floor Execution" description={activeCompany ? "Operation tracking · " + activeCompany.display_name : "Routing-based manufacturing workbench"} actions={canManage ? <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4"/>Generate operations</Button></DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Generate from approved routing</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label>Production order</Label><Select value={createForm.orderId} onValueChange={value=>setCreateForm(s=>({...s,orderId:value}))}><SelectTrigger><SelectValue placeholder="Select order"/></SelectTrigger><SelectContent>{(orders.data??[]).map(o=><SelectItem key={o.id} value={o.id}>{o.production_number} · {o.status}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Approved routing</Label><Select value={createForm.routingId} onValueChange={value=>setCreateForm(s=>({...s,routingId:value}))}><SelectTrigger><SelectValue placeholder="Select routing"/></SelectTrigger><SelectContent>{(routings.data??[]).map(r=><SelectItem key={r.id} value={r.id}>{r.code} rev {r.revision} · {r.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Planned quantity</Label><Input type="number" min="0.001" step="0.001" value={createForm.qty} onChange={e=>setCreateForm(s=>({...s,qty:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Planned start (optional)</Label><Input type="datetime-local" value={createForm.startAt} onChange={e=>setCreateForm(s=>({...s,startAt:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Job notes</Label><Textarea value={createForm.notes} onChange={e=>setCreateForm(s=>({...s,notes:e.target.value}))}/></div>
            {createForm.routingId && <div className="rounded-lg border p-3"><p className="text-sm font-medium">Operations to generate: {templateOps.length}</p><ol className="mt-2 list-decimal pl-5 text-xs text-muted-foreground">{templateOps.map(o=><li key={o.id}>{o.operation_no}. {o.name}{o.mandatory_qc?" · QC required":""}</li>)}</ol></div>}
            <Button className="min-h-11" onClick={()=>generate.mutate()} disabled={generate.isPending}>{generate.isPending?"Generating…":"Generate operation records"}</Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Creates operation tracking rows only. It does not consume stock, post accounting or receive finished goods.</p>
        </DialogContent>
      </Dialog>:undefined} />
      <PageBody>
        {!canManage && <div role="note" className="mb-4 rounded-lg border border-amber-300/50 bg-amber-50/50 p-3 text-sm text-amber-950 dark:bg-amber-950/10 dark:text-amber-100"><strong>Read-only for this role.</strong> The live database currently restricts writes in this workspace to approved administrators. The workspace remains visible, but editing actions are disabled until a reviewed database-policy migration is safely deployed.</div>}
        {loadError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 text-destructive"/><span>Shop-floor data could not be loaded. Check active-company access.</span></div>}
        {loading && <div role="status" className="mb-4 rounded-lg border p-4 text-sm text-muted-foreground">Loading shop-floor operations…</div>}
        {!loading && !loadError && <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Factory} label="Operations" value={String(operations.data?.length??0)} detail="Latest 5,000 records"/>
            <Metric icon={Play} label="Running" value={String(running)} detail="In progress now"/>
            <Metric icon={ListChecks} label="Open / blocked" value={String(open)} detail="Needs follow-through"/>
            <Metric icon={Timer} label="Downtime" value={String(downtime.toLocaleString("en-IN")) + " min"} detail="Recorded at operations"/>
          </div>
          {(operations.data??[]).length===0 ? <Card><CardContent className="p-8 text-center"><Factory className="mx-auto h-8 w-8 text-muted-foreground"/><h2 className="mt-3 font-semibold">No operation records yet</h2><p className="mt-1 text-sm text-muted-foreground">Approve a routing first, then generate operation records against a production order.</p></CardContent></Card> :
            <div className="space-y-5">{(orders.data??[]).filter(o=>(opsByOrder.get(o.id)??[]).length>0).map(order=><Card key={order.id}><CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">{order.production_number}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Order status: {order.status}</p></div><Badge variant="outline">{(opsByOrder.get(order.id)??[]).length} operations</Badge></div></CardHeader><CardContent>
              <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Op</th><th className="p-3">Operation / work centre</th><th className="p-3">Status</th><th className="p-3">Planned / good</th><th className="p-3">Scrap / rework</th><th className="p-3">Start / end</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y">{(opsByOrder.get(order.id)??[]).map(op=>{const r=op.routing_operation_id?routeOpById.get(op.routing_operation_id):undefined; const center=r?.work_center_id?centerById.get(r.work_center_id):undefined; return <tr key={op.id}><td className="p-3">{op.sequence_no}</td><td className="p-3"><div className="font-medium">{r?.name??"Production operation"}</div><div className="text-xs text-muted-foreground">{center?center.code+" · "+center.name:r?.operation_code??"No work centre mapped"}{r?.mandatory_qc?" · QC required":""}</div></td><td className="p-3"><Badge variant={op.status==="completed"?"default":op.status==="blocked"?"destructive":"secondary"}>{op.status}</Badge></td><td className="p-3">{q(op.planned_qty)} / {q(op.good_qty)}</td><td className="p-3">{q(op.scrap_qty)} / {q(op.rework_qty)}</td><td className="p-3 whitespace-nowrap text-xs">{when(op.actual_start)}<div>{when(op.actual_end)}</div></td><td className="p-3"><div className="flex flex-wrap gap-1">{canManage && ["pending","ready","paused","blocked"].includes(op.status) && <Button size="sm" variant="outline" onClick={()=>setOperationStatus.mutate({op,next:"running"})} disabled={setOperationStatus.isPending}><Play className="mr-1 h-3 w-3"/>Start</Button>}{canManage && op.status==="running" && <Button size="sm" variant="outline" onClick={()=>setOperationStatus.mutate({op,next:"paused"})} disabled={setOperationStatus.isPending}>Pause</Button>}{canManage && ["running","paused"].includes(op.status) && <Button size="sm" onClick={()=>{setFinishOp(op);setFinishForm({good:String(op.planned_qty),scrap:String(op.scrap_qty??0),rework:String(op.rework_qty??0),setup:String(op.setup_minutes??0),run:String(op.run_minutes??0),downtime:String(op.downtime_minutes??0),notes:op.notes??""});}}>Complete</Button>}</div></td></tr>})}</tbody></table></div>
            </CardContent></Card>)}</div>}
          <p className="mt-4 text-xs text-muted-foreground">Output, scrap, rework and time are operation records. Inventory consumption and finished-goods receipts require their separate guarded posting workflows.</p>
        </>}
      </PageBody>
      <Dialog open={Boolean(finishOp)} onOpenChange={open=>!open&&setFinishOp(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Complete operation</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Good output</Label><Input type="number" min="0" step="0.001" value={finishForm.good} onChange={e=>setFinishForm(s=>({...s,good:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Scrap</Label><Input type="number" min="0" step="0.001" value={finishForm.scrap} onChange={e=>setFinishForm(s=>({...s,scrap:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Rework</Label><Input type="number" min="0" step="0.001" value={finishForm.rework} onChange={e=>setFinishForm(s=>({...s,rework:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Setup minutes</Label><Input type="number" min="0" value={finishForm.setup} onChange={e=>setFinishForm(s=>({...s,setup:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Run minutes</Label><Input type="number" min="0" value={finishForm.run} onChange={e=>setFinishForm(s=>({...s,run:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Downtime minutes</Label><Input type="number" min="0" value={finishForm.downtime} onChange={e=>setFinishForm(s=>({...s,downtime:e.target.value}))}/></div>
            <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea value={finishForm.notes} onChange={e=>setFinishForm(s=>({...s,notes:e.target.value}))}/></div>
            <Button className="sm:col-span-2 min-h-11" onClick={()=>finish.mutate()} disabled={finish.isPending}>{finish.isPending?"Saving…":"Save operation output"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({icon:Icon,label,value,detail}:{icon:React.ComponentType<{className?:string}>,label:string,value:string,detail:string}) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5"/></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>;
}
