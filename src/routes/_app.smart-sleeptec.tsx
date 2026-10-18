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
import { AlertTriangle, Cpu, FileBox, GitBranch, Plus, ShieldCheck, Smartphone, Wrench } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
type Model = {
  id: string; company_id: string | null; code: string | null; name: string; size: string | null;
  thickness: string | null; cover_fabric: string | null; foam_density: string | null;
  warranty: string | null; default_price: number; extra_specs: Record<string, unknown>; notes: string | null;
};
type BomRevision = {
  id: string; company_id: string; model_id: string; revision: string; status: string;
  effective_from: string | null; effective_to: string | null; change_summary: string | null;
  created_by: string | null; approved_by: string | null; approved_at: string | null; created_at: string;
};
type BomLine = {
  id: string; company_id: string; bom_revision_id: string; raw_material_id: string | null;
  stock_item_id: string | null; quantity_per_unit: number; scrap_pct: number; operation_no: number | null;
  substitute_group: string | null;
};
type Material = { id: string; code: string | null; name: string; unit: string };
type StockItem = { id: string; code: string | null; name: string; unit: string };
type Eco = {
  id: string; company_id: string; eco_number: string; title: string; reason: string | null; priority: string;
  status: string; requested_by: string | null; approved_by: string | null; effective_from: string | null;
  released_at: string | null; created_at: string;
};
type EcoLine = {
  id: string; company_id: string; eco_id: string; entity_type: string; entity_id: string;
  change_type: string; old_value: unknown; new_value: unknown; reason: string | null;
};
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const dateLabel = (value: string | null) => value ? new Date(value + (value.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN") : "—";
const terminal = new Set(["released", "rejected", "cancelled"]);
const immutableBom = new Set(["released", "obsolete"]);

export const Route = createFileRoute("/_app/smart-sleeptec")({ component: SmartSleepTecPage });

function SmartSleepTecPage() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const { hasAnyRole, hasRole, user } = useAuth();
  const canManage = hasAnyRole(["admin", "production"]);
  const isAdmin = hasRole("admin");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [bomOpen, setBomOpen] = useState(false);
  const [lineBom, setLineBom] = useState<BomRevision | null>(null);
  const [ecoOpen, setEcoOpen] = useState(false);
  const [lineEco, setLineEco] = useState<Eco | null>(null);
  const [modelForm, setModelForm] = useState({
    code: "", name: "", size: "", thickness: "", default_price: "0", warranty: "",
    controller_model: "", firmware_track: "", connectivity: "Bluetooth and Wi-Fi", notes: "",
  });
  const [bomForm, setBomForm] = useState({ model_id: "", revision: "1", effective_from: "", change_summary: "" });
  const [bomLineForm, setBomLineForm] = useState({
    component_type: "stock_item", component_id: "", quantity_per_unit: "1", scrap_pct: "0",
    operation_no: "", substitute_group: "",
  });
  const [ecoForm, setEcoForm] = useState({
    title: "", reason: "", priority: "medium", effective_from: "",
    entity_type: "product_model", entity_id: "", change_type: "modify",
    old_value: "", new_value: "", line_reason: "",
  });
  const [ecoLineForm, setEcoLineForm] = useState({
    entity_type: "bom_revision", entity_id: "", change_type: "modify", old_value: "", new_value: "", reason: "",
  });

  const modelsQuery = useQuery({
    queryKey: ["smart-sleeptec-models", activeCompany?.id, search],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company to view product engineering records.");
      let request = db.from("product_models").select("id,company_id,code,name,size,thickness,cover_fabric,foam_density,warranty,default_price,extra_specs,notes")
        .eq("company_id", activeCompany.id).order("name").limit(500);
      if (search.trim()) {
        const safe = search.trim().replace(/[,%()]/g, " ").slice(0, 80);
        request = request.or(`name.ilike.%${safe}%,code.ilike.%${safe}%`);
      }
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as Model[];
    },
  });
  const revisionsQuery = useQuery({
    queryKey: ["smart-sleeptec-bom-revisions", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("bom_revisions").select("id,company_id,model_id,revision,status,effective_from,effective_to,change_summary,created_by,approved_by,approved_at,created_at")
        .eq("company_id", activeCompany!.id).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as BomRevision[];
    },
  });
  const linesQuery = useQuery({
    queryKey: ["smart-sleeptec-bom-lines", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("bom_revision_lines").select("id,company_id,bom_revision_id,raw_material_id,stock_item_id,quantity_per_unit,scrap_pct,operation_no,substitute_group")
        .eq("company_id", activeCompany!.id).order("operation_no", { ascending: true }).limit(5000);
      if (error) throw error;
      return (data ?? []) as BomLine[];
    },
  });
  const materialsQuery = useQuery({
    queryKey: ["smart-sleeptec-raw-materials", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("raw_materials").select("id,code,name,unit").eq("company_id", activeCompany!.id).order("name").limit(2000);
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });
  const stockQuery = useQuery({
    queryKey: ["smart-sleeptec-stock-items", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("stock_items").select("id,code,name,unit").eq("company_id", activeCompany!.id).eq("is_active", true).order("name").limit(2000);
      if (error) throw error;
      return (data ?? []) as StockItem[];
    },
  });
  const ecosQuery = useQuery({
    queryKey: ["smart-sleeptec-ecos", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("engineering_change_orders").select("id,company_id,eco_number,title,reason,priority,status,requested_by,approved_by,effective_from,released_at,created_at")
        .eq("company_id", activeCompany!.id).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as Eco[];
    },
  });
  const ecoLinesQuery = useQuery({
    queryKey: ["smart-sleeptec-eco-lines", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("engineering_change_order_lines").select("id,company_id,eco_id,entity_type,entity_id,change_type,old_value,new_value,reason")
        .eq("company_id", activeCompany!.id).limit(5000);
      if (error) throw error;
      return (data ?? []) as EcoLine[];
    },
  });

  const modelById = useMemo(() => new Map((modelsQuery.data ?? []).map(m => [m.id, m])), [modelsQuery.data]);
  const materialById = useMemo(() => new Map((materialsQuery.data ?? []).map(m => [m.id, m])), [materialsQuery.data]);
  const stockById = useMemo(() => new Map((stockQuery.data ?? []).map(s => [s.id, s])), [stockQuery.data]);
  const revisionsByModel = useMemo(() => {
    const map = new Map<string, BomRevision[]>();
    for (const r of revisionsQuery.data ?? []) map.set(r.model_id, [...(map.get(r.model_id) ?? []), r]);
    return map;
  }, [revisionsQuery.data]);
  const bomLinesByRevision = useMemo(() => {
    const map = new Map<string, BomLine[]>();
    for (const line of linesQuery.data ?? []) map.set(line.bom_revision_id, [...(map.get(line.bom_revision_id) ?? []), line]);
    return map;
  }, [linesQuery.data]);
  const ecoLineCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of ecoLinesQuery.data ?? []) map.set(line.eco_id, (map.get(line.eco_id) ?? 0) + 1);
    return map;
  }, [ecoLinesQuery.data]);
  const smartSpecs = (model: Model) => JSON.stringify(model.extra_specs ?? {}).toLowerCase().includes("smart_sleeptec");
  const focusedModels = (modelsQuery.data ?? []).filter(m => smartSpecs(m) || /smart\s*sleeptec|sleeptec/i.test(`${m.name} ${m.code ?? ""}`));
  const activeBoms = (revisionsQuery.data ?? []).filter(r => r.status === "released");
  const needsReview = (ecosQuery.data ?? []).filter(e => e.status === "draft" || e.status === "review");
  const loading = companyLoading || modelsQuery.isLoading || revisionsQuery.isLoading || linesQuery.isLoading || materialsQuery.isLoading || stockQuery.isLoading || ecosQuery.isLoading || ecoLinesQuery.isLoading;
  const loadError = modelsQuery.error || revisionsQuery.error || linesQuery.error || materialsQuery.error || stockQuery.error || ecosQuery.error || ecoLinesQuery.error;

  const createModel = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select the legal entity that owns this product record.");
      if (!modelForm.code.trim() || !modelForm.name.trim()) throw new Error("Product code and name are required.");
      const price = Number(modelForm.default_price || 0);
      if (!Number.isFinite(price) || price < 0) throw new Error("List price must be non-negative.");
      const { error } = await db.from("product_models").insert({
        company_id: activeCompany.id, code: modelForm.code.trim().toUpperCase(), name: modelForm.name.trim(),
        size: modelForm.size.trim() || null, thickness: modelForm.thickness.trim() || null,
        default_price: price, warranty: modelForm.warranty.trim() || null, notes: modelForm.notes.trim() || null,
        extra_specs: {
          product_line: "smart_sleeptec", product_family: "smart_mattress_technology",
          controller_model: modelForm.controller_model.trim() || null,
          firmware_track: modelForm.firmware_track.trim() || null,
          connectivity: modelForm.connectivity, lifecycle: "concept",
        },
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Smart SleepTec product record created as a concept.");
      setModelOpen(false);
      setModelForm({ code: "", name: "", size: "", thickness: "", default_price: "0", warranty: "", controller_model: "", firmware_track: "", connectivity: "Bluetooth and Wi-Fi", notes: "" });
      qc.invalidateQueries({ queryKey: ["smart-sleeptec-models", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const createBomRevision = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id || !modelById.has(bomForm.model_id)) throw new Error("Select a product model in the active company.");
      if (!bomForm.revision.trim()) throw new Error("Revision is required.");
      if (bomForm.effective_from && !/^\d{4}-\d{2}-\d{2}$/.test(bomForm.effective_from)) throw new Error("Effective date is invalid.");
      const { error } = await db.from("bom_revisions").insert({
        company_id: activeCompany.id, model_id: bomForm.model_id, revision: bomForm.revision.trim(),
        status: "draft", effective_from: bomForm.effective_from || null,
        change_summary: bomForm.change_summary.trim() || null, created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Draft BOM revision created.");
      setBomOpen(false);
      setBomForm({ model_id: "", revision: "1", effective_from: "", change_summary: "" });
      qc.invalidateQueries({ queryKey: ["smart-sleeptec-bom-revisions", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addBomLine = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id || !lineBom) throw new Error("Select a BOM revision.");
      if (!["draft","review"].includes(lineBom.status)) throw new Error("Released or approved BOM revisions are immutable. Create a new revision.");
      const selectedMaterial = bomLineForm.component_type === "raw_material" ? materialById.get(bomLineForm.component_id) : undefined;
      const selectedStock = bomLineForm.component_type === "stock_item" ? stockById.get(bomLineForm.component_id) : undefined;
      if (!selectedMaterial && !selectedStock) throw new Error("Select a component from the active company.");
      const quantity = Number(bomLineForm.quantity_per_unit), scrap = Number(bomLineForm.scrap_pct);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(scrap) || scrap < 0 || scrap > 100) throw new Error("Quantity must be positive and scrap percentage must be 0–100.");
      const operation = bomLineForm.operation_no.trim() ? Number(bomLineForm.operation_no) : null;
      if (operation !== null && (!Number.isInteger(operation) || operation < 1)) throw new Error("Operation number must be a positive whole number.");
      const { error } = await db.from("bom_revision_lines").insert({
        company_id: activeCompany.id, bom_revision_id: lineBom.id,
        raw_material_id: selectedMaterial?.id ?? null, stock_item_id: selectedStock?.id ?? null,
        quantity_per_unit: quantity, scrap_pct: scrap, operation_no: operation,
        substitute_group: bomLineForm.substitute_group.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("BOM component added.");
      setLineBom(null);
      setBomLineForm({ component_type: "stock_item", component_id: "", quantity_per_unit: "1", scrap_pct: "0", operation_no: "", substitute_group: "" });
      qc.invalidateQueries({ queryKey: ["smart-sleeptec-bom-lines", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const createEco = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a legal entity.");
      if (!ecoForm.title.trim() || !ecoForm.line_reason.trim()) throw new Error("ECO title and change-line reason are required.");
      if (!ecoForm.entity_id) throw new Error("Select the product, BOM revision or component affected.");
      const { data, error } = await db.from("engineering_change_orders").insert({
        company_id: activeCompany.id,
        eco_number: `ECO-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
        title: ecoForm.title.trim(), reason: ecoForm.reason.trim() || null, priority: ecoForm.priority,
        status: "draft", requested_by: user?.id ?? null, effective_from: ecoForm.effective_from || null,
      }).select("id").single();
      if (error) throw error;
      const oldValue = ecoForm.old_value.trim() ? JSON.parse(ecoForm.old_value) : null;
      const newValue = ecoForm.new_value.trim() ? JSON.parse(ecoForm.new_value) : null;
      const { error: lineError } = await db.from("engineering_change_order_lines").insert({
        company_id: activeCompany.id, eco_id: data.id,
        entity_type: ecoForm.entity_type, entity_id: ecoForm.entity_id,
        change_type: ecoForm.change_type, old_value: oldValue, new_value: newValue,
        reason: ecoForm.line_reason.trim(),
      });
      if (lineError) throw new Error("ECO draft created but its change line failed. Open the draft and add a reasoned change line before submission.");
    },
    onSuccess: () => {
      toast.success("Engineering change draft and reasoned change line recorded.");
      setEcoOpen(false);
      setEcoForm({ title: "", reason: "", priority: "medium", effective_from: "", entity_type: "product_model", entity_id: "", change_type: "modify", old_value: "", new_value: "", line_reason: "" });
      qc.invalidateQueries({ queryKey: ["smart-sleeptec-ecos", activeCompany?.id] });
      qc.invalidateQueries({ queryKey: ["smart-sleeptec-eco-lines", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addEcoLine = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id || !lineEco) throw new Error("Select an ECO.");
      if (!["draft","review"].includes(lineEco.status)) throw new Error("Approved or terminal ECOs are frozen.");
      if (!ecoLineForm.entity_id || !ecoLineForm.reason.trim()) throw new Error("Affected record and change reason are required.");
      const oldValue = ecoLineForm.old_value.trim() ? JSON.parse(ecoLineForm.old_value) : null;
      const newValue = ecoLineForm.new_value.trim() ? JSON.parse(ecoLineForm.new_value) : null;
      const { error } = await db.from("engineering_change_order_lines").insert({
        company_id: activeCompany.id, eco_id: lineEco.id, entity_type: ecoLineForm.entity_type,
        entity_id: ecoLineForm.entity_id, change_type: ecoLineForm.change_type, old_value: oldValue,
        new_value: newValue, reason: ecoLineForm.reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ECO change line added.");
      setLineEco(null);
      setEcoLineForm({ entity_type: "bom_revision", entity_id: "", change_type: "modify", old_value: "", new_value: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["smart-sleeptec-eco-lines", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const transitionBom = useMutation({
    mutationFn: async (args: { revision: BomRevision; to: "review" | "approved" }) => {
      if (!activeCompany?.id || !user?.id) throw new Error("Authenticated user and active company are required.");
      if (args.to === "review" && args.revision.status !== "draft") throw new Error("Only draft BOM revisions can enter review.");
      if (args.to === "approved" && (args.revision.status !== "review" || !isAdmin)) throw new Error("BOM approval is restricted to an administrator after review.");
      if (args.to === "approved" && args.revision.created_by === user.id) throw new Error("The BOM author cannot approve their own revision.");
      const patch: Record<string, unknown> = { status: args.to };
      if (args.to === "approved") {
        patch.approved_by = user.id;
        patch.approved_at = new Date().toISOString();
      }
      const { error } = await db.from("bom_revisions").update(patch)
        .eq("id", args.revision.id).eq("company_id", activeCompany.id).eq("status", args.revision.status);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("BOM revision status updated.");
      qc.invalidateQueries({ queryKey: ["smart-sleeptec-bom-revisions", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transitionEco = useMutation({
    mutationFn: async (args: { eco: Eco; to: "review" | "approved" | "released" | "cancelled" }) => {
      if (!activeCompany?.id || !user?.id) throw new Error("Authenticated user and active company are required.");
      if (args.to === "review" && args.eco.status !== "draft") throw new Error("Only draft ECOs can enter review.");
      if (args.to === "approved" && (args.eco.status !== "review" || args.eco.requested_by === user.id)) throw new Error("Approval requires a different user to review the ECO; the requester cannot approve their own change.");
      if (args.to === "approved" && !args.eco.effective_from) throw new Error("Set an effective date before approval.");
      if (args.to === "released" && (args.eco.status !== "approved" || !args.eco.effective_from || args.eco.effective_from > new Date().toISOString().slice(0,10))) throw new Error("Release requires an approved ECO whose effective date has arrived.");
      if (args.to === "cancelled" && !["draft","review","approved"].includes(args.eco.status)) throw new Error("This ECO can no longer be cancelled.");
      const patch: Record<string, unknown> = { status: args.to };
      if (args.to === "approved") patch.approved_by = user.id;
      if (args.to === "released") patch.released_at = new Date().toISOString();
      const { error } = await db.from("engineering_change_orders").update(patch).eq("id", args.eco.id).eq("company_id", activeCompany.id).eq("status", args.eco.status);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ECO status updated.");
      qc.invalidateQueries({ queryKey: ["smart-sleeptec-ecos", activeCompany?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loadingError = loadError;
  return (
    <>
      <PageHeader title="Smart SleepTec Product Studio" description={activeCompany ? `Product definitions, BOM revisions and engineering changes · ${activeCompany.display_name}` : "Manage the smart-mattress product engineering lifecycle."} actions={canManage ? <div className="flex flex-wrap gap-2">
        <Dialog open={ecoOpen} onOpenChange={setEcoOpen}>
          <DialogTrigger asChild><Button variant="outline"><GitBranch className="mr-2 h-4 w-4" />New engineering change</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Draft engineering change order</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2"><Label>Title</Label><Input value={ecoForm.title} onChange={e=>setEcoForm(s=>({...s,title:e.target.value}))} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Change reason / impact</Label><Textarea value={ecoForm.reason} onChange={e=>setEcoForm(s=>({...s,reason:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Priority</Label><Select value={ecoForm.priority} onValueChange={value=>setEcoForm(s=>({...s,priority:value}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Effective from</Label><Input type="date" value={ecoForm.effective_from} onChange={e=>setEcoForm(s=>({...s,effective_from:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Affected entity</Label><Select value={ecoForm.entity_type} onValueChange={value=>setEcoForm(s=>({...s,entity_type:value,entity_id:""}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="product_model">Product model</SelectItem><SelectItem value="bom_revision">BOM revision</SelectItem><SelectItem value="raw_material">Raw material</SelectItem><SelectItem value="stock_item">Stock item / component</SelectItem><SelectItem value="firmware">Firmware release</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Entity ID</Label><Input value={ecoForm.entity_id} onChange={e=>setEcoForm(s=>({...s,entity_id:e.target.value}))} placeholder="Copy the record UUID" /></div>
              <div className="space-y-1"><Label>Change type</Label><Select value={ecoForm.change_type} onValueChange={value=>setEcoForm(s=>({...s,change_type:value}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="add">Add</SelectItem><SelectItem value="modify">Modify</SelectItem><SelectItem value="replace">Replace</SelectItem><SelectItem value="remove">Remove</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Old value (JSON, optional)</Label><Textarea value={ecoForm.old_value} onChange={e=>setEcoForm(s=>({...s,old_value:e.target.value}))} placeholder='{"revision":"1"}' /></div>
              <div className="space-y-1"><Label>New value (JSON, optional)</Label><Textarea value={ecoForm.new_value} onChange={e=>setEcoForm(s=>({...s,new_value:e.target.value}))} placeholder='{"revision":"2"}' /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Change-line reason (required)</Label><Textarea value={ecoForm.line_reason} onChange={e=>setEcoForm(s=>({...s,line_reason:e.target.value}))} /></div>
              <Button className="sm:col-span-2 min-h-11" onClick={()=>createEco.mutate()} disabled={createEco.isPending}>{createEco.isPending?"Saving…":"Create ECO draft"}</Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">The database requires a reasoned change line before review. Released changes remain immutable; firmware testing/serial history is not yet a live table in this schema.</p>
          </DialogContent>
        </Dialog>
        <Dialog open={bomOpen} onOpenChange={setBomOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New BOM revision</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Create draft BOM revision</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1"><Label>Product model</Label><Select value={bomForm.model_id} onValueChange={value=>setBomForm(s=>({...s,model_id:value}))}><SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger><SelectContent>{(modelsQuery.data??[]).map(m=><SelectItem key={m.id} value={m.id}>{m.code ? `${m.code} · ` : ""}{m.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Revision number</Label><Input value={bomForm.revision} onChange={e=>setBomForm(s=>({...s,revision:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Effective from (optional in draft)</Label><Input type="date" value={bomForm.effective_from} onChange={e=>setBomForm(s=>({...s,effective_from:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Change summary</Label><Textarea value={bomForm.change_summary} onChange={e=>setBomForm(s=>({...s,change_summary:e.target.value}))} /></div>
              <Button className="min-h-11" onClick={()=>createBomRevision.mutate()} disabled={createBomRevision.isPending || !(modelsQuery.data??[]).length}>{createBomRevision.isPending?"Saving…":"Create draft revision"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={modelOpen} onOpenChange={setModelOpen}>
          <DialogTrigger asChild><Button variant="outline"><Cpu className="mr-2 h-4 w-4" />Register smart product</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Register Smart SleepTec concept</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Product code</Label><Input value={modelForm.code} onChange={e=>setModelForm(s=>({...s,code:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Product name</Label><Input value={modelForm.name} onChange={e=>setModelForm(s=>({...s,name:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Mattress size / kit variant</Label><Input value={modelForm.size} onChange={e=>setModelForm(s=>({...s,size:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Thickness / spec</Label><Input value={modelForm.thickness} onChange={e=>setModelForm(s=>({...s,thickness:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Planned list price (₹)</Label><Input type="number" min="0" step="0.01" value={modelForm.default_price} onChange={e=>setModelForm(s=>({...s,default_price:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Warranty proposal</Label><Input value={modelForm.warranty} onChange={e=>setModelForm(s=>({...s,warranty:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Controller / PCB model</Label><Input value={modelForm.controller_model} onChange={e=>setModelForm(s=>({...s,controller_model:e.target.value}))} /></div>
              <div className="space-y-1"><Label>Firmware track / version</Label><Input value={modelForm.firmware_track} onChange={e=>setModelForm(s=>({...s,firmware_track:e.target.value}))} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Connectivity</Label><Select value={modelForm.connectivity} onValueChange={value=>setModelForm(s=>({...s,connectivity:value}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Bluetooth">Bluetooth</SelectItem><SelectItem value="Wi-Fi">Wi-Fi</SelectItem><SelectItem value="Bluetooth and Wi-Fi">Bluetooth and Wi-Fi</SelectItem><SelectItem value="Other / to be defined">Other / to be defined</SelectItem></SelectContent></Select></div>
              <div className="space-y-1 sm:col-span-2"><Label>Engineering notes</Label><Textarea value={modelForm.notes} onChange={e=>setModelForm(s=>({...s,notes:e.target.value}))} /></div>
              <Button className="sm:col-span-2 min-h-11" onClick={()=>createModel.mutate()} disabled={createModel.isPending}>{createModel.isPending?"Saving…":"Save concept"}</Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">This creates an unapproved concept record in the selected company only. It does not create a new legal entity, approve a BOM, release firmware or imply a tested/safety-certified product.</p>
          </DialogContent>
        </Dialog>
      </div> : undefined} />
      <PageBody>
        {loadError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" /><span>Engineering records could not be loaded. Verify active-company access and refresh.</span></div>}
        {loading && <div role="status" className="mb-4 rounded-lg border p-4 text-sm text-muted-foreground">Loading product engineering records…</div>}
        {!loading && !loadingError && <>
          {activeCompany && <div className="mb-5 rounded-lg border border-amber-300/40 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/10"><p className="font-semibold">Legal-entity boundary</p><p className="mt-1 text-muted-foreground">All new records are saved only to <strong>{activeCompany.display_name}</strong>. This screen does not create the planned Zizz Smart Sleep Technologies LLP or transfer the Zizz trademark; company setup and intercompany accounting require their own authorised workflows.</p></div>}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Smart SleepTec product concepts</h2><p className="text-xs text-muted-foreground">Showing explicit Smart SleepTec tags or matching product names/codes.</p></div><div className="w-full sm:max-w-sm"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search models by name or code" /></div></div>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Cpu} label="Smart-tagged products" value={String(focusedModels.length)} detail="In current company/search result" />
            <Metric icon={FileBox} label="BOM revisions" value={String(revisionsQuery.data?.length??0)} detail="All product model revisions" />
            <Metric icon={ShieldCheck} label="Released BOMs" value={String(activeBoms.length)} detail="Approved engineering outputs" />
            <Metric icon={GitBranch} label="ECOs awaiting action" value={String(needsReview.length)} detail="Draft / review" />
          </div>
          {focusedModels.length === 0 ? <Card className="mb-5"><CardContent className="p-6"><Cpu className="h-7 w-7 text-muted-foreground" /><h3 className="mt-2 font-semibold">No Smart SleepTec product records found</h3><p className="mt-1 text-sm text-muted-foreground">Use “Register smart product” to create a concept under the selected legal entity. Confirm the active company before saving. No production specifications are seeded or fabricated.</p></CardContent></Card> : <div className="mb-5 grid gap-3 xl:grid-cols-2">{focusedModels.map(m=><Card key={m.id}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{m.code ? `${m.code} · ` : ""}{m.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{m.size??"Size not set"} · {m.thickness??"Thickness not set"}</p></div><Badge variant="secondary">Concept / product master</Badge></div></CardHeader><CardContent className="space-y-2"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Mini label="List price" value={money(Number(m.default_price))}/><Mini label="Warranty" value={m.warranty??"Not set"}/><Mini label="BOM revisions" value={String(revisionsByModel.get(m.id)?.length??0)}/></div><p className="text-xs text-muted-foreground">Specifications: {JSON.stringify(m.extra_specs??{})}</p><div className="flex flex-wrap gap-2">{(revisionsByModel.get(m.id)??[]).map(r=><Badge key={r.id} variant={r.status==="released"?"default":"outline"}>{r.revision} · {r.status}</Badge>)}</div></CardContent></Card>)}</div>}
          <Card className="mb-5"><CardHeader><CardTitle className="text-base">BOM / kit revision register</CardTitle></CardHeader><CardContent>
            {(revisionsQuery.data??[]).length===0?<p className="py-4 text-sm text-muted-foreground">No BOM revisions exist in this company.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Product</th><th className="p-3">Revision</th><th className="p-3">Status</th><th className="p-3">Effective from / to</th><th className="p-3">Components</th><th className="p-3">Change summary</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y">{(revisionsQuery.data??[]).map(r=><tr key={r.id}><td className="p-3">{modelById.get(r.model_id)?.code??"Model"} · {modelById.get(r.model_id)?.name??"Unavailable"}</td><td className="p-3">{r.revision}</td><td className="p-3"><Badge variant={r.status==="released"?"default":immutableBom.has(r.status)?"secondary":"outline"}>{r.status}</Badge></td><td className="p-3 whitespace-nowrap">{dateLabel(r.effective_from)} / {dateLabel(r.effective_to)}</td><td className="p-3">{bomLinesByRevision.get(r.id)?.length??0}</td><td className="p-3 max-w-[240px] text-xs">{r.change_summary??"—"}</td><td className="p-3"><div className="flex flex-wrap gap-1">{canManage && ["draft","review"].includes(r.status) && <Button size="sm" variant="outline" onClick={()=>{setLineBom(r);setBomLineForm({component_type:"stock_item",component_id:"",quantity_per_unit:"1",scrap_pct:"0",operation_no:"",substitute_group:""});}}>Add component</Button>}{canManage && r.status==="draft" && <Button size="sm" variant="outline" onClick={()=>transitionBom.mutate({revision:r,to:"review"})} disabled={transitionBom.isPending || !(bomLinesByRevision.get(r.id)?.length)}>Submit review</Button>}{isAdmin && r.status==="review" && r.created_by!==user?.id && <Button size="sm" onClick={()=>transitionBom.mutate({revision:r,to:"approved"})} disabled={transitionBom.isPending}>Approve</Button>}</div></td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <Card className="mb-5"><CardHeader><CardTitle className="text-base">Engineering change control</CardTitle></CardHeader><CardContent>
            {(ecosQuery.data??[]).length===0?<p className="py-4 text-sm text-muted-foreground">No engineering changes recorded.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">ECO</th><th className="p-3">Priority / status</th><th className="p-3">Effective date</th><th className="p-3">Change lines</th><th className="p-3">Requested / approved by</th><th className="p-3">Workflow</th></tr></thead><tbody className="divide-y">{(ecosQuery.data??[]).map(e=><tr key={e.id}><td className="p-3"><div className="font-medium">{e.eco_number} · {e.title}</div><div className="text-xs text-muted-foreground">{e.reason??"Reason not recorded"}</div></td><td className="p-3 capitalize">{e.priority} / {e.status}</td><td className="p-3 whitespace-nowrap">{dateLabel(e.effective_from)}</td><td className="p-3">{ecoLineCount.get(e.id)??0}</td><td className="p-3 text-xs">{e.requested_by??"—"} / {e.approved_by??"—"}</td><td className="p-3"><div className="flex flex-wrap gap-1">{canManage && !terminal.has(e.status) && ["draft","review"].includes(e.status) && <Button size="sm" variant="outline" onClick={()=>{setLineEco(e);setEcoLineForm({entity_type:"bom_revision",entity_id:"",change_type:"modify",old_value:"",new_value:"",reason:""});}}>Add line</Button>}{canManage && e.status==="draft" && <Button size="sm" variant="outline" onClick={()=>transitionEco.mutate({eco:e,to:"review"})} disabled={transitionEco.isPending || !ecoLineCount.get(e.id)}>Submit review</Button>}{isAdmin && e.status==="review" && e.requested_by!==user?.id && <Button size="sm" onClick={()=>transitionEco.mutate({eco:e,to:"approved"})} disabled={transitionEco.isPending}>Approve</Button>}{canManage && e.status==="approved" && <Button size="sm" onClick={()=>transitionEco.mutate({eco:e,to:"released"})} disabled={transitionEco.isPending}>Release</Button>}{canManage && ["draft","review"].includes(e.status) && <Button size="sm" variant="ghost" onClick={()=>transitionEco.mutate({eco:e,to:"cancelled"})} disabled={transitionEco.isPending}>Cancel</Button>}</div></td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <p className="text-xs text-muted-foreground">BOM revisions support draft, review and independent approval. Release is intentionally blocked until the verified live schema contains the BOM-to-ECO link required by the database release guard; this workspace will not bypass that release gate. Firmware binaries, serialised controller/device registry, assembly test logs, Bluetooth/Wi-Fi provisioning and warranty service records need a later verified schema and product-safety workflow.</p>
        </>}
      </PageBody>
      <Dialog open={Boolean(lineBom)} onOpenChange={open=>!open&&setLineBom(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Add BOM / kit component · {lineBom?.revision}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label>Component source</Label><Select value={bomLineForm.component_type} onValueChange={value=>setBomLineForm(s=>({...s,component_type:value,component_id:""}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stock_item">Stock item / component</SelectItem><SelectItem value="raw_material">Raw material</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Component</Label><Select value={bomLineForm.component_id} onValueChange={value=>setBomLineForm(s=>({...s,component_id:value}))}><SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger><SelectContent>{bomLineForm.component_type==="raw_material"?(materialsQuery.data??[]).map(m=><SelectItem key={m.id} value={m.id}>{m.code?`${m.code} · `:""}{m.name} ({m.unit})</SelectItem>):(stockQuery.data??[]).map(s=><SelectItem key={s.id} value={s.id}>{s.code?`${s.code} · `:""}{s.name} ({s.unit})</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Quantity per product</Label><Input type="number" min="0.0001" step="0.0001" value={bomLineForm.quantity_per_unit} onChange={e=>setBomLineForm(s=>({...s,quantity_per_unit:e.target.value}))}/></div><div className="space-y-1"><Label>Scrap (%)</Label><Input type="number" min="0" max="100" step="0.01" value={bomLineForm.scrap_pct} onChange={e=>setBomLineForm(s=>({...s,scrap_pct:e.target.value}))}/></div></div>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Routing operation no.</Label><Input type="number" min="1" step="1" value={bomLineForm.operation_no} onChange={e=>setBomLineForm(s=>({...s,operation_no:e.target.value}))}/></div><div className="space-y-1"><Label>Substitute group</Label><Input value={bomLineForm.substitute_group} onChange={e=>setBomLineForm(s=>({...s,substitute_group:e.target.value}))}/></div></div>
            <Button className="min-h-11" onClick={()=>addBomLine.mutate()} disabled={addBomLine.isPending}>{addBomLine.isPending?"Saving…":"Add component"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(lineEco)} onOpenChange={open=>!open&&setLineEco(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Add reasoned ECO line · {lineEco?.eco_number}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label>Entity type</Label><Select value={ecoLineForm.entity_type} onValueChange={value=>setEcoLineForm(s=>({...s,entity_type:value}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bom_revision">BOM revision</SelectItem><SelectItem value="product_model">Product model</SelectItem><SelectItem value="raw_material">Raw material</SelectItem><SelectItem value="stock_item">Stock item</SelectItem><SelectItem value="firmware">Firmware release</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Affected record UUID</Label><Input value={ecoLineForm.entity_id} onChange={e=>setEcoLineForm(s=>({...s,entity_id:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Change type</Label><Select value={ecoLineForm.change_type} onValueChange={value=>setEcoLineForm(s=>({...s,change_type:value}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="add">Add</SelectItem><SelectItem value="modify">Modify</SelectItem><SelectItem value="replace">Replace</SelectItem><SelectItem value="remove">Remove</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Old value (JSON, optional)</Label><Textarea value={ecoLineForm.old_value} onChange={e=>setEcoLineForm(s=>({...s,old_value:e.target.value}))}/></div>
            <div className="space-y-1"><Label>New value (JSON, optional)</Label><Textarea value={ecoLineForm.new_value} onChange={e=>setEcoLineForm(s=>({...s,new_value:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Reason (required)</Label><Textarea value={ecoLineForm.reason} onChange={e=>setEcoLineForm(s=>({...s,reason:e.target.value}))}/></div>
            <Button className="min-h-11" onClick={()=>addEcoLine.mutate()} disabled={addEcoLine.isPending}>{addEcoLine.isPending?"Saving…":"Save change line"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Metric({icon:Icon,label,value,detail}:{icon:React.ComponentType<{className?:string}>,label:string,value:string,detail:string}) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>;
}
function Mini({label,value}:{label:string,value:string}) {
  return <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}
