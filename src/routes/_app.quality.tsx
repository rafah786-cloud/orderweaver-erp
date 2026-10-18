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
import { AlertTriangle, ClipboardCheck, ClipboardList, Plus, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
type Inspection = {
  id: string; company_id: string; inspection_number: string; production_order_id: string | null;
  purchase_bill_id: string | null; stock_item_id: string | null; stage: string; inspected_at: string;
  quantity_inspected: number; quantity_accepted: number; quantity_rejected: number; status: string; notes: string | null;
};
type Nonconformance = {
  id: string; company_id: string; nc_number: string; inspection_id: string | null;
  production_order_id: string | null; supplier_id: string | null; severity: string; defect_code: string;
  description: string; disposition: string | null; status: string; root_cause: string | null;
  containment_action: string | null; created_at: string; closed_at: string | null;
};
type Capa = { id: string; nc_id: string; action_type: string; action_text: string; owner_id: string | null; due_date: string | null; status: string; effectiveness_result: string | null };
type Production = { id: string; production_number: string; status: string };
type StockItem = { id: string; name: string; sku: string | null };
type Supplier = { id: string; name: string };
const dateTime = (value: string) => new Date(value).toLocaleString("en-IN");
const qty = (value: number) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });

export const Route = createFileRoute("/_app/quality")({ component: QualityPage });

function QualityPage() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const { hasAnyRole, user } = useAuth();
  const canManage = hasAnyRole(["admin", "production"]);
  const qc = useQueryClient();
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [resultInspection, setResultInspection] = useState<Inspection | null>(null);
  const [ncOpen, setNcOpen] = useState(false);
  const [capaNc, setCapaNc] = useState<Nonconformance | null>(null);
  const [inspectionForm, setInspectionForm] = useState({
    stage: "in_process", production_order_id: "", purchase_bill_id: "", stock_item_id: "",
    quantity_inspected: "1", notes: "",
  });
  const [resultForm, setResultForm] = useState({
    status: "passed", quantity_accepted: "", quantity_rejected: "0", characteristic_code: "",
    characteristic_name: "", target_value: "", lower_limit: "", upper_limit: "",
    measured_value: "", unit: "", notes: "",
  });
  const [ncForm, setNcForm] = useState({
    inspection_id: "", production_order_id: "", supplier_id: "", severity: "minor",
    defect_code: "", description: "", disposition: "hold", root_cause: "", containment_action: "",
  });
  const [capaForm, setCapaForm] = useState({
    action_type: "corrective", action_text: "", due_date: "", owner_id: "",
  });

  const inspectionsQuery = useQuery({
    queryKey: ["quality-inspections", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("quality_inspections").select(
        "id,company_id,inspection_number,production_order_id,purchase_bill_id,stock_item_id,stage,inspected_at,quantity_inspected,quantity_accepted,quantity_rejected,status,notes",
      ).eq("company_id", activeCompany!.id).order("inspected_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Inspection[];
    },
  });
  const ncQuery = useQuery({
    queryKey: ["quality-ncs", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("quality_nonconformances").select(
        "id,company_id,nc_number,inspection_id,production_order_id,supplier_id,severity,defect_code,description,disposition,status,root_cause,containment_action,created_at,closed_at",
      ).eq("company_id", activeCompany!.id).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Nonconformance[];
    },
  });
  const capaQuery = useQuery({
    queryKey: ["quality-capa", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("quality_capa_actions").select("id,nc_id,action_type,action_text,owner_id,due_date,status,effectiveness_result").eq("company_id", activeCompany!.id).order("due_date", { ascending: true }).limit(1000);
      if (error) throw error;
      return (data ?? []) as Capa[];
    },
  });
  const productionQuery = useQuery({
    queryKey: ["quality-production-orders", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("production_orders").select("id,production_number,status").eq("company_id", activeCompany!.id).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Production[];
    },
  });
  const stockQuery = useQuery({
    queryKey: ["quality-stock-items", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("stock_items").select("id,name,sku").eq("company_id", activeCompany!.id).order("name").limit(1000);
      if (error) throw error;
      return (data ?? []) as StockItem[];
    },
  });
  const supplierQuery = useQuery({
    queryKey: ["quality-suppliers", activeCompany?.id],
    enabled: ncOpen && !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("suppliers").select("id,name").eq("company_id", activeCompany!.id).order("name").limit(500);
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });
  const productionById = useMemo(() => new Map((productionQuery.data ?? []).map(row => [row.id, row])), [productionQuery.data]);
  const stockById = useMemo(() => new Map((stockQuery.data ?? []).map(row => [row.id, row])), [stockQuery.data]);
  const inspectionById = useMemo(() => new Map((inspectionsQuery.data ?? []).map(row => [row.id, row])), [inspectionsQuery.data]);
  const openNCs = (ncQuery.data ?? []).filter(n => n.status !== "closed");
  const openCAPA = (capaQuery.data ?? []).filter(a => a.status !== "done" && a.status !== "cancelled");
  const failedInspections = (inspectionsQuery.data ?? []).filter(i => i.status === "failed" || i.status === "conditional");
  const loading = companyLoading || inspectionsQuery.isLoading || ncQuery.isLoading || capaQuery.isLoading || productionQuery.isLoading || stockQuery.isLoading;
  const loadError = inspectionsQuery.error || ncQuery.error || capaQuery.error || productionQuery.error || stockQuery.error;

  const createInspection = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select an active company.");
      const inspected = Number(inspectionForm.quantity_inspected);
      if (!Number.isFinite(inspected) || inspected <= 0) throw new Error("Inspection quantity must be greater than zero.");
      if (inspectionForm.production_order_id && !productionById.has(inspectionForm.production_order_id)) throw new Error("Production order does not belong to the active company.");
      if (inspectionForm.stock_item_id && !stockById.has(inspectionForm.stock_item_id)) throw new Error("Stock item does not belong to the active company.");
      const { error } = await db.from("quality_inspections").insert({
        company_id: activeCompany.id,
        inspection_number: `QI-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
        stage: inspectionForm.stage, production_order_id: inspectionForm.production_order_id || null,
        purchase_bill_id: inspectionForm.purchase_bill_id || null, stock_item_id: inspectionForm.stock_item_id || null,
        inspected_at: new Date().toISOString(), inspector_id: user?.id ?? null,
        quantity_inspected: inspected, quantity_accepted: 0, quantity_rejected: 0,
        status: "open", notes: inspectionForm.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quality inspection opened.");
      setInspectionOpen(false);
      setInspectionForm({ stage: "in_process", production_order_id: "", purchase_bill_id: "", stock_item_id: "", quantity_inspected: "1", notes: "" });
      qc.invalidateQueries({ queryKey: ["quality-inspections", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordInspectionResult = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id || !resultInspection) throw new Error("Select an inspection.");
      if (resultInspection.status !== "open") throw new Error("Only open inspections can be dispositioned.");
      const inspected = Number(resultInspection.quantity_inspected);
      const accepted = Number(resultForm.quantity_accepted);
      const rejected = Number(resultForm.quantity_rejected);
      if (!Number.isFinite(accepted) || !Number.isFinite(rejected) || accepted < 0 || rejected < 0 || accepted + rejected > inspected) {
        throw new Error("Accepted and rejected quantities must be non-negative and cannot exceed the inspected quantity.");
      }
      if (resultForm.status === "passed" && (accepted !== inspected || rejected !== 0)) {
        throw new Error("A passed inspection requires every inspected unit accepted and zero rejected.");
      }
      if (resultForm.status === "failed" && rejected === 0) {
        throw new Error("A failed inspection must record at least one rejected unit.");
      }
      if (resultForm.status === "conditional" && accepted + rejected === inspected) {
        throw new Error("Use passed or failed when every unit has a disposition; conditional is for unresolved units.");
      }
      if (resultForm.characteristic_code.trim() && !resultForm.characteristic_name.trim()) throw new Error("Characteristic name is required with a characteristic code.");
      const target = resultForm.target_value.trim() ? Number(resultForm.target_value) : null;
      const low = resultForm.lower_limit.trim() ? Number(resultForm.lower_limit) : null;
      const high = resultForm.upper_limit.trim() ? Number(resultForm.upper_limit) : null;
      const measured = resultForm.measured_value.trim() ? Number(resultForm.measured_value) : null;
      if ([target,low,high,measured].some(v => v !== null && !Number.isFinite(v))) throw new Error("Measured values and limits must be numeric.");
      if (low !== null && high !== null && low > high) throw new Error("Lower limit must not exceed upper limit.");
      if (resultForm.characteristic_code.trim()) {
        const { error: resultError } = await db.from("quality_results").insert({
          company_id: activeCompany.id, inspection_id: resultInspection.id,
          characteristic_code: resultForm.characteristic_code.trim().toUpperCase(),
          characteristic_name: resultForm.characteristic_name.trim(), target_value: target,
          lower_limit: low, upper_limit: high, measured_value: measured, unit: resultForm.unit.trim() || null,
          result: resultForm.status === "passed" ? "pass" : resultForm.status === "failed" ? "fail" : "conditional",
          evidence: { note: resultForm.notes.trim() || null, entered_via: "quality_workspace" },
        });
        if (resultError) throw resultError;
      }
      const { error } = await db.from("quality_inspections").update({
        status: resultForm.status, quantity_accepted: accepted, quantity_rejected: rejected,
        notes: resultForm.notes.trim() || resultInspection.notes,
      }).eq("id", resultInspection.id).eq("company_id", activeCompany.id).eq("status", "open");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inspection result recorded.");
      setResultInspection(null);
      qc.invalidateQueries({ queryKey: ["quality-inspections", activeCompany?.id] });
      qc.invalidateQueries({ queryKey: ["quality-ncs", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createNC = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select an active company.");
      if (!ncForm.defect_code.trim() || !ncForm.description.trim()) throw new Error("Defect code and description are required.");
      if (ncForm.inspection_id && !inspectionById.has(ncForm.inspection_id)) throw new Error("Inspection must belong to the active company.");
      if (ncForm.production_order_id && !productionById.has(ncForm.production_order_id)) throw new Error("Production order must belong to the active company.");
      const { error } = await db.from("quality_nonconformances").insert({
        company_id: activeCompany.id,
        nc_number: `NC-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
        inspection_id: ncForm.inspection_id || null, production_order_id: ncForm.production_order_id || null,
        supplier_id: ncForm.supplier_id || null, severity: ncForm.severity,
        defect_code: ncForm.defect_code.trim().toUpperCase(), description: ncForm.description.trim(),
        disposition: ncForm.disposition, status: "open", root_cause: ncForm.root_cause.trim() || null,
        containment_action: ncForm.containment_action.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Non-conformance recorded.");
      setNcOpen(false);
      setNcForm({ inspection_id: "", production_order_id: "", supplier_id: "", severity: "minor", defect_code: "", description: "", disposition: "hold", root_cause: "", containment_action: "" });
      qc.invalidateQueries({ queryKey: ["quality-ncs", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCAPA = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id || !capaNc) throw new Error("Select a non-conformance.");
      if (capaNc.status === "closed") throw new Error("Closed non-conformances cannot accept new actions.");
      if (!capaForm.action_text.trim()) throw new Error("Action description is required.");
      const { error } = await db.from("quality_capa_actions").insert({
        company_id: activeCompany.id, nc_id: capaNc.id, action_type: capaForm.action_type,
        action_text: capaForm.action_text.trim(), owner_id: capaForm.owner_id || user?.id || null,
        due_date: capaForm.due_date || null, status: "open",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corrective action added.");
      setCapaNc(null);
      setCapaForm({ action_type: "corrective", action_text: "", due_date: "", owner_id: "" });
      qc.invalidateQueries({ queryKey: ["quality-capa", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markCapaDone = useMutation({
    mutationFn: async (action: Capa) => {
      if (!activeCompany?.id) throw new Error("Select a company.");
      const result = window.prompt("Record effectiveness / verification result before closing this action.");
      if (!result?.trim()) throw new Error("Effectiveness result is required.");
      const { error } = await db.from("quality_capa_actions").update({
        status: "done", completed_at: new Date().toISOString(), effectiveness_result: result.trim(),
      }).eq("id", action.id).eq("company_id", activeCompany.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corrective action verified and closed.");
      qc.invalidateQueries({ queryKey: ["quality-capa", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Quality Management" description={activeCompany ? `Inspections, non-conformances and corrective actions · ${activeCompany.display_name}` : "Control incoming, in-process and final mattress inspections."} actions={canManage ? <div className="flex flex-wrap gap-2">
        <Dialog open={inspectionOpen} onOpenChange={setInspectionOpen}>
          <DialogTrigger asChild><Button variant="outline"><ClipboardCheck className="mr-2 h-4 w-4" />New inspection</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Open quality inspection</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1"><Label>Inspection stage</Label><Select value={inspectionForm.stage} onValueChange={value=>setInspectionForm(s=>({...s,stage:value}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="incoming">Incoming material</SelectItem><SelectItem value="in_process">In-process operation</SelectItem><SelectItem value="final">Final finished-mattress QC</SelectItem><SelectItem value="return">Customer return</SelectItem><SelectItem value="smart_sleeptec">Smart SleepTec device / kit</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Production order (optional)</Label><Select value={inspectionForm.production_order_id} onValueChange={value=>setInspectionForm(s=>({...s,production_order_id:value}))}><SelectTrigger><SelectValue placeholder="Select production order" /></SelectTrigger><SelectContent>{(productionQuery.data??[]).map(o=><SelectItem key={o.id} value={o.id}>{o.production_number} · {o.status}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Stock item (optional)</Label><Select value={inspectionForm.stock_item_id} onValueChange={value=>setInspectionForm(s=>({...s,stock_item_id:value}))}><SelectTrigger><SelectValue placeholder="Select finished good or component" /></SelectTrigger><SelectContent>{(stockQuery.data??[]).map(s=><SelectItem key={s.id} value={s.id}>{s.sku ? `${s.sku} · ` : ""}{s.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Quantity inspected</Label><Input type="number" min="0.001" step="0.001" value={inspectionForm.quantity_inspected} onChange={e=>setInspectionForm(s=>({...s,quantity_inspected:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Inspection notes</Label><Textarea value={inspectionForm.notes} onChange={e=>setInspectionForm(s=>({...s,notes:e.target.value}))} /></div>
              <Button className="min-h-11" onClick={()=>createInspection.mutate()} disabled={createInspection.isPending}>{createInspection.isPending?"Opening…":"Open inspection"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={ncOpen} onOpenChange={setNcOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Record defect</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Record non-conformance</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2"><Label>Related inspection (optional)</Label><Select value={ncForm.inspection_id} onValueChange={value=>setNcForm(s=>({...s,inspection_id:value}))}><SelectTrigger><SelectValue placeholder="Select inspection" /></SelectTrigger><SelectContent>{(inspectionsQuery.data??[]).map(i=><SelectItem key={i.id} value={i.id}>{i.inspection_number} · {i.stage} · {i.status}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Production order (optional)</Label><Select value={ncForm.production_order_id} onValueChange={value=>setNcForm(s=>({...s,production_order_id:value}))}><SelectTrigger><SelectValue placeholder="Select production" /></SelectTrigger><SelectContent>{(productionQuery.data??[]).map(o=><SelectItem key={o.id} value={o.id}>{o.production_number}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Supplier (optional)</Label><Select value={ncForm.supplier_id} onValueChange={value=>setNcForm(s=>({...s,supplier_id:value}))}><SelectTrigger><SelectValue placeholder={supplierQuery.isLoading?"Loading suppliers…":"Select supplier"} /></SelectTrigger><SelectContent>{(supplierQuery.data??[]).map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Severity</Label><Select value={ncForm.severity} onValueChange={value=>setNcForm(s=>({...s,severity:value}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="minor">Minor</SelectItem><SelectItem value="major">Major</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Disposition</Label><Select value={ncForm.disposition} onValueChange={value=>setNcForm(s=>({...s,disposition:value}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[["hold","Hold / quarantine"],["rework","Rework"],["scrap","Scrap"],["return_to_supplier","Return to supplier"],["use_as_is","Use as-is"],["concession","Concession"]].map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Defect code</Label><Input value={ncForm.defect_code} onChange={e=>setNcForm(s=>({...s,defect_code:e.target.value}))} placeholder="e.g. SEAM-OPEN" /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Description</Label><Textarea value={ncForm.description} onChange={e=>setNcForm(s=>({...s,description:e.target.value}))} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Root cause (if known)</Label><Textarea value={ncForm.root_cause} onChange={e=>setNcForm(s=>({...s,root_cause:e.target.value}))} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Containment / quarantine action</Label><Textarea value={ncForm.containment_action} onChange={e=>setNcForm(s=>({...s,containment_action:e.target.value}))} /></div>
              <Button className="sm:col-span-2 min-h-11" onClick={()=>createNC.mutate()} disabled={createNC.isPending}>{createNC.isPending?"Saving…":"Save non-conformance"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div> : undefined} />
      <PageBody>
        {loadError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" /><span>Quality data could not be loaded. Check active-company access and retry.</span></div>}
        {loading && <div role="status" className="mb-4 rounded-lg border p-4 text-sm text-muted-foreground">Loading quality records…</div>}
        {!loading && !loadError && <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={ClipboardCheck} label="Inspections" value={String(inspectionsQuery.data?.length??0)} detail="Latest 500 records" />
            <Metric icon={XCircle} label="Failed / conditional" value={String(failedInspections.length)} detail="Needs review" />
            <Metric icon={AlertTriangle} label="Open defects" value={String(openNCs.length)} detail="Non-conformance records" />
            <Metric icon={ShieldCheck} label="Open CAPA actions" value={String(openCAPA.length)} detail="Corrective / preventive" />
          </div>
          <Card className="mb-5"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" />Inspection register</CardTitle></CardHeader><CardContent>
            {(inspectionsQuery.data??[]).length===0?<p className="py-4 text-sm text-muted-foreground">No inspections recorded for this company.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Inspection</th><th className="p-3">Stage / source</th><th className="p-3">Inspected</th><th className="p-3">Accepted / rejected</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y">{(inspectionsQuery.data??[]).map(i=><tr key={i.id}><td className="p-3"><div className="font-medium">{i.inspection_number}</div><div className="text-xs text-muted-foreground">{dateTime(i.inspected_at)}</div></td><td className="p-3"><div className="capitalize">{i.stage.replaceAll("_"," ")}</div><div className="text-xs text-muted-foreground">{i.production_order_id ? productionById.get(i.production_order_id)?.production_number ?? "Production order unavailable" : i.stock_item_id ? stockById.get(i.stock_item_id)?.name ?? "Stock item unavailable" : "General inspection"}</div></td><td className="p-3 tabular-nums">{qty(i.quantity_inspected)}</td><td className="p-3 tabular-nums">{qty(i.quantity_accepted)} / {qty(i.quantity_rejected)}</td><td className="p-3"><Badge variant={i.status==="passed"?"default":i.status==="failed"?"destructive":"secondary"} className="capitalize">{i.status}</Badge></td><td className="p-3">{canManage && i.status==="open" && <Button size="sm" variant="outline" onClick={()=>{setResultInspection(i);setResultForm({status:"passed",quantity_accepted:String(i.quantity_inspected),quantity_rejected:"0",characteristic_code:"",characteristic_name:"",target_value:"",lower_limit:"",upper_limit:"",measured_value:"",unit:"",notes:i.notes??""});}}>Disposition</Button>}</td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <Card className="mb-5"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><XCircle className="h-4 w-4" />Non-conformances</CardTitle></CardHeader><CardContent>
            {(ncQuery.data??[]).length===0?<p className="py-4 text-sm text-muted-foreground">No defects recorded for this company.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Record</th><th className="p-3">Severity</th><th className="p-3">Disposition</th><th className="p-3">Status</th><th className="p-3">Containment / root cause</th><th className="p-3">Corrective action</th></tr></thead><tbody className="divide-y">{(ncQuery.data??[]).map(n=><tr key={n.id}><td className="p-3"><div className="font-medium">{n.nc_number} · {n.defect_code}</div><div className="max-w-[260px] text-xs text-muted-foreground">{n.description}</div></td><td className="p-3"><Badge variant={n.severity==="critical"?"destructive":"secondary"}>{n.severity}</Badge></td><td className="p-3 capitalize">{(n.disposition??"hold").replaceAll("_"," ")}</td><td className="p-3"><Badge variant={n.status==="closed"?"default":"outline"}>{n.status}</Badge></td><td className="p-3 text-xs">{n.containment_action??"—"}{n.root_cause ? <p className="mt-1 text-muted-foreground">Root cause: {n.root_cause}</p> : null}</td><td className="p-3">{canManage && n.status!=="closed" && <Button size="sm" variant="outline" onClick={()=>{setCapaNc(n);setCapaForm({action_type:"corrective",action_text:"",due_date:"",owner_id:user?.id??""});}}>Add CAPA</Button>}</td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" />Corrective and preventive actions</CardTitle></CardHeader><CardContent>
            {(capaQuery.data??[]).length===0?<p className="py-4 text-sm text-muted-foreground">No CAPA actions recorded.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Type / action</th><th className="p-3">Non-conformance</th><th className="p-3">Owner</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3">Evidence</th><th /></tr></thead><tbody className="divide-y">{(capaQuery.data??[]).map(a=><tr key={a.id}><td className="p-3"><div className="capitalize">{a.action_type}</div><div className="text-xs text-muted-foreground">{a.action_text}</div></td><td className="p-3">{ncQuery.data?.find(n=>n.id===a.nc_id)?.nc_number??"NC unavailable"}</td><td className="p-3 text-xs">{a.owner_id??"Unassigned"}</td><td className="p-3 whitespace-nowrap">{a.due_date??"—"}</td><td className="p-3"><Badge variant={a.status==="done"?"default":a.status==="overdue"?"destructive":"outline"}>{a.status}</Badge></td><td className="p-3 max-w-[180px] text-xs">{a.effectiveness_result??"—"}</td><td className="p-3">{canManage && a.status!=="done" && a.status!=="cancelled" && <Button size="sm" onClick={()=>markCapaDone.mutate(a)} disabled={markCapaDone.isPending}>Verify / close</Button>}</td></tr>)}</tbody></table></div>}
          </CardContent></Card>
        </>}
      </PageBody>
      <Dialog open={Boolean(resultInspection)} onOpenChange={open=>!open&&setResultInspection(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Record inspection result · {resultInspection?.inspection_number}</DialogTitle></DialogHeader>
          {resultInspection && <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Disposition</Label><Select value={resultForm.status} onValueChange={value=>setResultForm(s=>({...s,status:value,quantity_accepted:value==="passed"?String(resultInspection.quantity_inspected):s.quantity_accepted,quantity_rejected:value==="passed"?"0":s.quantity_rejected}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="passed">Passed</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="conditional">Conditional / hold</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Quantity accepted</Label><Input type="number" min="0" step="0.001" value={resultForm.quantity_accepted} onChange={e=>setResultForm(s=>({...s,quantity_accepted:e.target.value}))} /></div>
            <div className="space-y-1"><Label>Quantity rejected</Label><Input type="number" min="0" step="0.001" value={resultForm.quantity_rejected} onChange={e=>setResultForm(s=>({...s,quantity_rejected:e.target.value}))} /></div>
            <div className="sm:col-span-2 rounded-lg border p-3"><p className="text-sm font-medium">Optional measurable characteristic</p><p className="text-xs text-muted-foreground">Add a single quality measurement to the inspection record; repeat for additional characteristics.</p></div>
            <div className="space-y-1"><Label>Characteristic code</Label><Input value={resultForm.characteristic_code} onChange={e=>setResultForm(s=>({...s,characteristic_code:e.target.value}))} placeholder="e.g. THICKNESS" /></div>
            <div className="space-y-1"><Label>Characteristic name</Label><Input value={resultForm.characteristic_name} onChange={e=>setResultForm(s=>({...s,characteristic_name:e.target.value}))} placeholder="e.g. Mattress thickness" /></div>
            <div className="space-y-1"><Label>Target</Label><Input type="number" value={resultForm.target_value} onChange={e=>setResultForm(s=>({...s,target_value:e.target.value}))} /></div>
            <div className="space-y-1"><Label>Lower / upper limits are independent optional values below.</Label><div className="grid grid-cols-2 gap-2"><Input type="number" aria-label="Lower limit" value={resultForm.lower_limit} onChange={e=>setResultForm(s=>({...s,lower_limit:e.target.value}))} /><Input type="number" aria-label="Upper limit" value={resultForm.upper_limit} onChange={e=>setResultForm(s=>({...s,upper_limit:e.target.value}))} /></div></div>
            <div className="space-y-1"><Label>Measured value</Label><Input type="number" value={resultForm.measured_value} onChange={e=>setResultForm(s=>({...s,measured_value:e.target.value}))} /></div>
            <div className="space-y-1"><Label>Unit</Label><Input value={resultForm.unit} onChange={e=>setResultForm(s=>({...s,unit:e.target.value}))} placeholder="mm, kg, N…" /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Notes / evidence summary</Label><Textarea value={resultForm.notes} onChange={e=>setResultForm(s=>({...s,notes:e.target.value}))} /></div>
            <Button className="sm:col-span-2 min-h-11" onClick={()=>recordInspectionResult.mutate()} disabled={recordInspectionResult.isPending}>{recordInspectionResult.isPending?"Saving…":"Save inspection result"}</Button>
          </div>}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(capaNc)} onOpenChange={open=>!open&&setCapaNc(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Add corrective / preventive action · {capaNc?.nc_number}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label>Action type</Label><Select value={capaForm.action_type} onValueChange={value=>setCapaForm(s=>({...s,action_type:value}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="containment">Containment</SelectItem><SelectItem value="corrective">Corrective</SelectItem><SelectItem value="preventive">Preventive</SelectItem><SelectItem value="verification">Verification</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Action</Label><Textarea value={capaForm.action_text} onChange={e=>setCapaForm(s=>({...s,action_text:e.target.value}))} /></div>
            <div className="space-y-1"><Label>Owner user ID (optional)</Label><Input value={capaForm.owner_id} onChange={e=>setCapaForm(s=>({...s,owner_id:e.target.value}))} placeholder="UUID of accountable employee" /></div>
            <div className="space-y-1"><Label>Due date</Label><Input type="date" value={capaForm.due_date} onChange={e=>setCapaForm(s=>({...s,due_date:e.target.value}))} /></div>
            <Button className="min-h-11" onClick={()=>createCAPA.mutate()} disabled={createCAPA.isPending}>{createCAPA.isPending?"Saving…":"Create action"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({icon:Icon,label,value,detail}:{icon:React.ComponentType<{className?:string}>,label:string,value:string,detail:string}) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>;
}
