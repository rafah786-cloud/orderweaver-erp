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
import { AlertTriangle, CheckCircle2, PackageCheck, Plus, Truck } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
type Order = { id: string; company_id: string; order_number: string; party_id: string; order_date: string; expected_delivery: string | null; fulfillment_status: string };
type Party = { id: string; name: string };
type OrderItem = { id: string; company_id: string | null; sales_order_id: string; product_name: string; size: string | null; quantity: number; model_id: string | null };
type ShipmentLine = { id: string; shipment_id: string; sales_order_item_id: string | null; quantity: number; stock_item_id: string | null };
type Shipment = { id: string; company_id: string; shipment_number: string; sales_order_id: string | null; invoice_id: string | null; party_id: string | null; shipment_date: string; status: string; transporter_name: string | null; tracking_number: string | null; expected_delivery: string | null; delivered_at: string | null; pod_reference: string | null; notes: string | null };
const dateLabel = (v: string | null) => v ? new Date(v + (v.length===10 ? "T00:00:00" : "")).toLocaleDateString("en-IN") : "—";
const NEXT: Record<string,string|null> = { draft:"packed", packed:"dispatched", dispatched:"in_transit", in_transit:"delivered", delivered:null, cancelled:null, returned:null };

export const Route = createFileRoute("/_app/shipments")({ component: ShipmentsPage });

function ShipmentsPage() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["admin"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [delivery, setDelivery] = useState<Shipment|null>(null);
  const [deliveryForm, setDeliveryForm] = useState({ pod_reference:"", notes:"" });
  const [form, setForm] = useState({ sales_order_id:"", shipment_date:new Date().toISOString().slice(0,10), expected_delivery:"", transporter_name:"", tracking_number:"", notes:"" });
  const [lineQty, setLineQty] = useState<Record<string,string>>({});

  const orders = useQuery({
    queryKey:["shipment-orders",activeCompany?.id],enabled:!companyLoading&&Boolean(activeCompany?.id),
    queryFn:async()=>{
      const {data,error}=await db.from("sales_orders").select("id,company_id,order_number,party_id,order_date,expected_delivery,fulfillment_status")
        .eq("company_id",activeCompany!.id).order("order_date",{ascending:false}).limit(1000);
      if(error) throw error;
      return (data??[]) as Order[];
    },
  });
  const parties = useQuery({
    queryKey:["shipment-parties",activeCompany?.id],enabled:!companyLoading&&Boolean(activeCompany?.id),
    queryFn:async()=>{
      const {data,error}=await db.from("parties").select("id,name").eq("company_id",activeCompany!.id).order("name").limit(2000);
      if(error) throw error;
      return (data??[]) as Party[];
    },
  });
  const orderItems = useQuery({
    queryKey:["shipment-order-items",activeCompany?.id,form.sales_order_id],enabled:!companyLoading&&Boolean(activeCompany?.id)&&Boolean(form.sales_order_id),
    queryFn:async()=>{
      const {data,error}=await db.from("sales_order_items").select("id,company_id,sales_order_id,product_name,size,quantity,model_id")
        .eq("company_id",activeCompany!.id).eq("sales_order_id",form.sales_order_id).order("product_name").limit(1000);
      if(error) throw error;
      return (data??[]) as OrderItem[];
    },
  });
  const shipmentLines = useQuery({
    queryKey:["shipment-lines",activeCompany?.id],enabled:!companyLoading&&Boolean(activeCompany?.id),
    queryFn:async()=>{
      const {data,error}=await db.from("shipment_lines").select("id,shipment_id,sales_order_item_id,quantity,stock_item_id")
        .eq("company_id",activeCompany!.id).limit(5000);
      if(error) throw error;
      return (data??[]) as ShipmentLine[];
    },
  });
  const shipments = useQuery({
    queryKey:["shipments",activeCompany?.id],enabled:!companyLoading&&Boolean(activeCompany?.id),
    queryFn:async()=>{
      const {data,error}=await db.from("shipments").select("id,company_id,shipment_number,sales_order_id,invoice_id,party_id,shipment_date,status,transporter_name,tracking_number,expected_delivery,delivered_at,pod_reference,notes")
        .eq("company_id",activeCompany!.id).order("shipment_date",{ascending:false}).limit(2000);
      if(error) throw error;
      return (data??[]) as Shipment[];
    },
  });
  const orderById=useMemo(()=>new Map((orders.data??[]).map(o=>[o.id,o])),[orders.data]);
  const partyById=useMemo(()=>new Map((parties.data??[]).map(p=>[p.id,p])),[parties.data]);
  const openDeliveries=(shipments.data??[]).filter(s=>!["delivered","cancelled","returned"].includes(s.status));
  const linesByShipment=useMemo(()=>{const map=new Map<string,ShipmentLine[]>();for(const line of shipmentLines.data??[])map.set(line.shipment_id,[...(map.get(line.shipment_id)??[]),line]);return map;},[shipmentLines.data]);
  const shipmentById=useMemo(()=>new Map((shipments.data??[]).map(s=>[s.id,s])),[shipments.data]);
  const shippedByOrderItem=useMemo(()=>{
    const map=new Map<string,number>();
    for(const line of shipmentLines.data??[]){
      const shipment=shipmentById.get(line.shipment_id);
      if(!shipment||["cancelled","returned"].includes(shipment.status)||!line.sales_order_item_id) continue;
      map.set(line.sales_order_item_id,(map.get(line.sales_order_item_id)??0)+Number(line.quantity||0));
    }
    return map;
  },[shipmentLines.data,shipmentById]);
  const remainingForItem=(item:OrderItem)=>Math.max(0,Number(item.quantity)-(shippedByOrderItem.get(item.id)??0));
  const overdue=(shipments.data??[]).filter(s=>s.expected_delivery&&s.expected_delivery<new Date().toISOString().slice(0,10)&&!["delivered","cancelled","returned"].includes(s.status));
  const loading=companyLoading||orders.isLoading||parties.isLoading||shipments.isLoading||shipmentLines.isLoading;
  const loadError=orders.error||parties.error||shipments.error||shipmentLines.error;

  const createShipment=useMutation({
    mutationFn:async()=>{
      if(!activeCompany?.id) throw new Error("Select an active company.");
      const order=orderById.get(form.sales_order_id);
      if(!order) throw new Error("Select a sales order in the active company.");
      if(!form.shipment_date) throw new Error("Shipment date is required.");
      if(form.expected_delivery&&form.expected_delivery<form.shipment_date) throw new Error("Expected delivery cannot precede the shipment date.");
      const selectedItems=orderItems.data??[];
      if(!selectedItems.length) throw new Error("The selected order has no item lines in this company; shipment creation is blocked.");
      const requestedLines=selectedItems.map(item=>({item,quantity:Number(lineQty[item.id]??remainingForItem(item)),remaining:remainingForItem(item)}));
      if(requestedLines.some(line=>!Number.isFinite(line.quantity)||line.quantity<0||line.quantity>line.remaining)) throw new Error("Shipment quantity must be between zero and the remaining ordered quantity for each item.");
      const lines=requestedLines.filter(line=>line.quantity>0);
      if(!lines.length) throw new Error("At least one positive shipment quantity is required.");
      const stamp=new Date().toISOString().slice(0,10).replaceAll("-","");
      const number="SHP-"+stamp+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
      const {data:shipment,error}=await db.from("shipments").insert({
        company_id:activeCompany.id,shipment_number:number,sales_order_id:order.id,party_id:order.party_id,
        shipment_date:form.shipment_date,expected_delivery:form.expected_delivery||order.expected_delivery||null,
        transporter_name:form.transporter_name.trim()||null,tracking_number:form.tracking_number.trim()||null,
        status:"draft",notes:form.notes.trim()||null,
      }).select("id").single();
      if(error) throw error;
      const {error:lineError}=await db.from("shipment_lines").insert(lines.map(({item,quantity})=>({
        company_id:activeCompany.id,shipment_id:shipment.id,sales_order_item_id:item.id,quantity,stock_item_id:null,
      })));
      if(lineError){
        await db.from("shipments").delete().eq("id",shipment.id).eq("company_id",activeCompany.id).eq("status","draft");
        throw lineError;
      }
    },
    onSuccess:()=>{
      toast.success("Shipment created.");
      setOpen(false);
      setForm({sales_order_id:"",shipment_date:new Date().toISOString().slice(0,10),expected_delivery:"",transporter_name:"",tracking_number:"",notes:""});
      setLineQty({});
      qc.invalidateQueries({queryKey:["shipments",activeCompany?.id]});
      qc.invalidateQueries({queryKey:["shipment-lines",activeCompany?.id]});
    },
    onError:(e:Error)=>toast.error(e.message),
  });
  const advance=useMutation({
    mutationFn:async(args:{shipment:Shipment;to:string})=>{
      if(!activeCompany?.id||!canManage) throw new Error("Logistics permission required.");
      const s=args.shipment;
      if(NEXT[s.status]!==args.to) throw new Error("Invalid shipment transition. Refresh and try again.");
      const patch:Record<string,unknown>={status:args.to};
      if(args.to==="delivered"){
        if(!s.pod_reference?.trim()&&!deliveryForm.pod_reference.trim()) throw new Error("Proof-of-delivery reference is required before marking delivered.");
        patch.delivered_at=new Date().toISOString();
        patch.pod_reference=deliveryForm.pod_reference.trim()||s.pod_reference;
        patch.notes=deliveryForm.notes.trim()||s.notes;
      }
      const {error}=await db.from("shipments").update(patch).eq("id",s.id).eq("company_id",activeCompany.id).eq("status",s.status);
      if(error) throw error;
    },
    onSuccess:()=>{
      toast.success("Shipment status updated.");
      setDelivery(null);setDeliveryForm({pod_reference:"",notes:""});
      qc.invalidateQueries({queryKey:["shipments",activeCompany?.id]});
    },
    onError:(e:Error)=>toast.error(e.message),
  });
  const savePOD=useMutation({
    mutationFn:async()=>{
      if(!activeCompany?.id||!delivery) throw new Error("Select a shipment.");
      if(!deliveryForm.pod_reference.trim()) throw new Error("Proof-of-delivery reference is required.");
      const {error}=await db.from("shipments").update({pod_reference:deliveryForm.pod_reference.trim(),notes:deliveryForm.notes.trim()||delivery.notes})
        .eq("id",delivery.id).eq("company_id",activeCompany.id).eq("status","in_transit");
      if(error) throw error;
    },
    onSuccess:()=>{
      toast.success("Delivery evidence saved. Review it and mark the shipment delivered when confirmed.");
      setDelivery(current=>current?{...current,pod_reference:deliveryForm.pod_reference.trim(),notes:deliveryForm.notes.trim()||current.notes}:current);
      qc.invalidateQueries({queryKey:["shipments",activeCompany?.id]});
    },
    onError:(e:Error)=>toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Shipments & Delivery" description={activeCompany?"Dispatch, tracking and proof of delivery · "+activeCompany.display_name:"Order fulfilment and delivery tracking"} actions={canManage?<Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4"/>New shipment</Button></DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Create shipment record</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label>Sales order</Label><Select value={form.sales_order_id} onValueChange={value=>{setForm(s=>({...s,sales_order_id:value}));setLineQty({});}}><SelectTrigger><SelectValue placeholder="Select sales order"/></SelectTrigger><SelectContent>{(orders.data??[]).filter(o=>o.fulfillment_status!=="dispatched").map(o=><SelectItem key={o.id} value={o.id}>{o.order_number} · {partyById.get(o.party_id)?.name??"Customer"}</SelectItem>)}</SelectContent></Select></div>
            {form.sales_order_id && <div className="space-y-2 rounded-lg border p-3"><Label>Shipment quantities</Label>{orderItems.isLoading?<p className="text-xs text-muted-foreground">Loading order lines…</p>:(orderItems.data??[]).map(item=><div key={item.id} className="grid grid-cols-[1fr_100px] items-center gap-3"><div className="min-w-0"><p className="text-sm font-medium">{item.product_name}</p><p className="text-xs text-muted-foreground">{item.size??"Standard"} · ordered {item.quantity} · remaining {remainingForItem(item)}</p></div><Input aria-label={`Shipment quantity for ${item.product_name}`} type="number" min="0" max={item.quantity} step="0.001" value={lineQty[item.id]??String(remainingForItem(item))} onChange={e=>setLineQty(s=>({...s,[item.id]:e.target.value}))}/></div>)}</div>}
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Shipment date</Label><Input type="date" value={form.shipment_date} onChange={e=>setForm(s=>({...s,shipment_date:e.target.value}))}/></div><div className="space-y-1"><Label>Expected delivery</Label><Input type="date" value={form.expected_delivery} onChange={e=>setForm(s=>({...s,expected_delivery:e.target.value}))}/></div></div>
            <div className="space-y-1"><Label>Transporter / driver</Label><Input value={form.transporter_name} onChange={e=>setForm(s=>({...s,transporter_name:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Tracking number</Label><Input value={form.tracking_number} onChange={e=>setForm(s=>({...s,tracking_number:e.target.value}))}/></div>
            <div className="space-y-1"><Label>Handling / delivery notes</Label><Textarea value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))}/></div>
            <Button className="min-h-11" onClick={()=>createShipment.mutate()} disabled={createShipment.isPending}>{createShipment.isPending?"Saving…":"Create shipment"}</Button>
          </div>
        </DialogContent>
      </Dialog>:undefined}/>
      <PageBody>
        {!canManage && <div role="note" className="mb-4 rounded-lg border border-amber-300/50 bg-amber-50/50 p-3 text-sm text-amber-950 dark:bg-amber-950/10 dark:text-amber-100"><strong>Read-only for this role.</strong> The live database currently restricts writes in this workspace to approved administrators. The workspace remains visible, but editing actions are disabled until a reviewed database-policy migration is safely deployed.</div>}
        {loadError&&<div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 text-destructive"/><span>Shipment data could not be loaded. Check company access.</span></div>}
        {loading&&<div role="status" className="mb-4 rounded-lg border p-4 text-sm text-muted-foreground">Loading shipments…</div>}
        {!loading&&!loadError&&<>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Truck} label="Shipments" value={String(shipments.data?.length??0)}/>
            <Metric icon={PackageCheck} label="In progress" value={String(openDeliveries.length)}/>
            <Metric icon={AlertTriangle} label="Overdue" value={String(overdue.length)}/>
            <Metric icon={CheckCircle2} label="Delivered" value={String((shipments.data??[]).filter(s=>s.status==="delivered").length)}/>
          </div>
          <Card><CardHeader><CardTitle className="text-base">Shipment register</CardTitle></CardHeader><CardContent>
            {(shipments.data??[]).length===0?<p className="py-4 text-sm text-muted-foreground">No shipment records yet. Create one from a confirmed sales order.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Shipment</th><th className="p-3">Customer / order</th><th className="p-3">Dates</th><th className="p-3">Carrier / tracking</th><th className="p-3">Status</th><th className="p-3">Items</th><th className="p-3">POD</th><th className="p-3">Next action</th></tr></thead><tbody className="divide-y">{(shipments.data??[]).map(s=>{const order=s.sales_order_id?orderById.get(s.sales_order_id):undefined;return <tr key={s.id}><td className="p-3"><div className="font-medium">{s.shipment_number}</div><div className="text-xs text-muted-foreground">{s.notes??"—"}</div></td><td className="p-3"><div>{partyById.get(s.party_id??"")?.name??"Customer unavailable"}</div><div className="text-xs text-muted-foreground">{order?.order_number??"No linked order"}</div></td><td className="p-3 whitespace-nowrap"><div>Ship: {dateLabel(s.shipment_date)}</div><div>Due: {dateLabel(s.expected_delivery)}</div><div>Delivered: {dateLabel(s.delivered_at)}</div></td><td className="p-3"><div>{s.transporter_name??"Not assigned"}</div><div className="text-xs text-muted-foreground">{s.tracking_number??"No tracking number"}</div></td><td className="p-3"><Badge variant={s.status==="delivered"?"default":s.status==="cancelled"?"destructive":"secondary"}>{s.status}</Badge></td><td className="p-3">{(linesByShipment.get(s.id)??[]).length} line(s) · {(linesByShipment.get(s.id)??[]).reduce((sum,line)=>sum+Number(line.quantity||0),0)} qty</td><td className="p-3">{s.pod_reference??"Not captured"}</td><td className="p-3"><div className="flex flex-wrap gap-1">{canManage&&s.status==="in_transit"&&<Button size="sm" variant="outline" onClick={()=>{setDelivery(s);setDeliveryForm({pod_reference:s.pod_reference??"",notes:s.notes??""})}}>Record POD</Button>}{canManage&&NEXT[s.status]&&<Button size="sm" onClick={()=>{if(NEXT[s.status]==="delivered"){setDelivery(s);setDeliveryForm({pod_reference:s.pod_reference??"",notes:s.notes??""})}else advance.mutate({shipment:s,to:NEXT[s.status]!})}} disabled={advance.isPending}> {NEXT[s.status]==="packed"?"Pack":NEXT[s.status]==="dispatched"?"Dispatch":NEXT[s.status]==="in_transit"?"In transit":"Delivered"} </Button>}</div></td></tr>})}</tbody></table></div>}
          </CardContent></Card>
          <p className="mt-3 text-xs text-muted-foreground">This records carrier milestones and proof of delivery. It does not silently post stock movement or invoice/accounting changes; those must follow the canonical dispatch and finance posting workflows.</p>
        </>}
      </PageBody>
      <Dialog open={Boolean(delivery)} onOpenChange={open=>!open&&setDelivery(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Delivery evidence · {delivery?.shipment_number}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label>Proof-of-delivery reference</Label><Input value={deliveryForm.pod_reference} onChange={e=>setDeliveryForm(s=>({...s,pod_reference:e.target.value}))} placeholder="Signed slip / photo reference / receiver acknowledgement"/></div>
            <div className="space-y-1"><Label>Delivery notes</Label><Textarea value={deliveryForm.notes} onChange={e=>setDeliveryForm(s=>({...s,notes:e.target.value}))}/></div>
            <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" onClick={()=>savePOD.mutate()} disabled={savePOD.isPending||delivery?.status!=="in_transit"}>{savePOD.isPending?"Saving…":"Save POD"}</Button><Button className="min-h-11" onClick={()=>delivery&&advance.mutate({shipment:delivery,to:"delivered"})} disabled={advance.isPending||delivery?.status!=="in_transit"}>Mark delivered</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
function Metric({icon:Icon,label,value}:{icon:React.ComponentType<{className?:string}>,label:string,value:string}) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5"/></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div></CardContent></Card>;
}
