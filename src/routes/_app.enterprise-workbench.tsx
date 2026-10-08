import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, RefreshCw, Save, Trash2, Factory, ClipboardCheck, Wrench, GitBranch, ShoppingCart, Warehouse, Landmark, Users, Truck, BriefcaseBusiness, Workflow, Sparkles, Database } from "lucide-react";

export const Route = createFileRoute("/_app/enterprise-workbench")({
  head: () => ({ meta: [
    { title: "Enterprise Workbench | Mattress Maestro ERP" },
    { name: "description", content: "Operational CRUD and lifecycle control for the enterprise ERP capability domains." },
  ] }),
  component: EnterpriseWorkbench,
});

type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime" | "textarea" | "select";
  required?: boolean;
  options?: string[];
  placeholder?: string;
  defaultValue?: string;
};

type EntityConfig = {
  key: string;
  table: string;
  title: string;
  description: string;
  fields: Field[];
  columns: string[];
  statusField?: string;
  statusOptions?: string[];
  orderBy?: string;
};

type ModuleConfig = {
  key: string;
  title: string;
  icon: typeof Factory;
  entities: EntityConfig[];
};

const F = (key: string, label: string, type: Field["type"] = "text", extra: Partial<Field> = {}): Field => ({ key, label, type, ...extra });

const MODULES: ModuleConfig[] = [
  {
    key: "manufacturing", title: "Manufacturing Planning", icon: Factory, entities: [
      { key: "work-centers", table: "work_centers", title: "Work Centres", description: "Capacity, efficiency and utilization master data.", fields: [F("code","Code","text",{required:true}),F("name","Name","text",{required:true}),F("department","Department"),F("work_center_type","Type","select",{options:["machine","labor","mixed"],defaultValue:"machine"}),F("capacity_minutes_per_day","Capacity minutes/day","number",{defaultValue:"480"}),F("efficiency_pct","Efficiency %","number",{defaultValue:"100"})], columns:["code","name","department","work_center_type","capacity_minutes_per_day","efficiency_pct"], orderBy:"code" },
      { key: "mps-plans", table: "mps_plans", title: "MPS Plans", description: "Master production schedules with controlled lifecycle.", fields: [F("plan_number","Plan number","text",{required:true}),F("name","Name","text",{required:true}),F("horizon_start","Start","date",{required:true}),F("horizon_end","End","date",{required:true}),F("planning_policy","Policy","select",{options:["make_to_stock","make_to_order","mixed"],defaultValue:"make_to_stock"}),F("status","Status","select",{options:["draft","approved","released","closed","cancelled"],defaultValue:"draft"}),F("notes","Notes","textarea")], columns:["plan_number","name","horizon_start","horizon_end","status","planning_policy"], statusField:"status", statusOptions:["draft","approved","released","closed","cancelled"], orderBy:"created_at" },
      { key: "routings", table: "routings", title: "Routings", description: "Manufacturing route revisions and effective dates.", fields: [F("code","Code","text",{required:true}),F("name","Name","text",{required:true}),F("model_id","Product model ID"),F("revision","Revision","text",{defaultValue:"1"}),F("status","Status","select",{options:["draft","approved","obsolete"],defaultValue:"draft"}),F("effective_from","Effective from","date"),F("effective_to","Effective to","date"),F("notes","Notes","textarea")], columns:["code","name","revision","status","effective_from","effective_to"], statusField:"status", statusOptions:["draft","approved","obsolete"], orderBy:"code" },
      { key: "mrp-runs", table: "mrp_runs", title: "MRP Runs", description: "Planning snapshots and exception control; no direct ledger posting.", fields: [F("run_number","Run number","text",{required:true}),F("plan_id","MPS plan ID"),F("horizon_start","Start","date",{required:true}),F("horizon_end","End","date",{required:true}),F("status","Status","select",{options:["running","completed","failed","cancelled"],defaultValue:"running"}),F("planning_parameters","Planning parameters (JSON)","textarea",{defaultValue:"{}"})], columns:["run_number","horizon_start","horizon_end","status","run_at"], statusField:"status", statusOptions:["running","completed","failed","cancelled"], orderBy:"run_at" },
      { key: "production-operations", table: "production_operations", title: "Production Operations", description: "Operation-level WIP, good output, scrap, rework and downtime.", fields: [F("production_order_id","Production order ID","text",{required:true}),F("sequence_no","Sequence","number",{required:true,defaultValue:"10"}),F("status","Status","select",{options:["pending","ready","running","paused","completed","blocked","cancelled"],defaultValue:"pending"}),F("planned_qty","Planned qty","number",{defaultValue:"0"}),F("good_qty","Good qty","number",{defaultValue:"0"}),F("scrap_qty","Scrap qty","number",{defaultValue:"0"}),F("rework_qty","Rework qty","number",{defaultValue:"0"}),F("downtime_minutes","Downtime minutes","number",{defaultValue:"0"}),F("notes","Notes","textarea")], columns:["sequence_no","status","planned_qty","good_qty","scrap_qty","rework_qty","downtime_minutes"], statusField:"status", statusOptions:["pending","ready","running","paused","completed","blocked","cancelled"], orderBy:"sequence_no" },
    ],
  },
  {
    key: "quality", title: "Quality", icon: ClipboardCheck, entities: [
      { key: "quality-plans", table:"quality_plans", title:"Inspection Plans", description:"Controlled inspection plans and acceptance rules.", fields:[F("code","Code","text",{required:true}),F("name","Name","text",{required:true}),F("model_id","Product model ID"),F("revision","Revision","text",{defaultValue:"1"}),F("status","Status","select",{options:["draft","approved","obsolete"],defaultValue:"draft"}),F("sampling_method","Sampling","select",{options:["100_percent","aql","skip_lot","first_article"],defaultValue:"100_percent"}),F("acceptance_rule","Acceptance rule (JSON)","textarea",{defaultValue:"{}"})], columns:["code","name","revision","status","sampling_method"], statusField:"status", statusOptions:["draft","approved","obsolete"], orderBy:"code" },
      { key:"quality-inspections",table:"quality_inspections",title:"Inspections",description:"In-process, incoming and final inspection records.",fields:[F("inspection_number","Inspection number","text",{required:true}),F("quality_plan_id","Quality plan ID"),F("production_order_id","Production order ID"),F("purchase_bill_id","Purchase bill ID"),F("stage","Stage","text",{required:true,placeholder:"incoming / in-process / final"}),F("quantity_inspected","Inspected qty","number",{defaultValue:"0"}),F("quantity_accepted","Accepted qty","number",{defaultValue:"0"}),F("quantity_rejected","Rejected qty","number",{defaultValue:"0"}),F("status","Status","select",{options:["open","passed","failed","conditional","cancelled"],defaultValue:"open"}),F("notes","Notes","textarea")],columns:["inspection_number","stage","quantity_inspected","quantity_accepted","quantity_rejected","status"],statusField:"status",statusOptions:["open","passed","failed","conditional","cancelled"],orderBy:"inspected_at"},
      { key:"quality-nc",table:"quality_nonconformances",title:"Nonconformances / CAPA",description:"Defect containment, disposition and root-cause control.",fields:[F("nc_number","NC number","text",{required:true}),F("inspection_id","Inspection ID"),F("production_order_id","Production order ID"),F("supplier_id","Supplier ID"),F("severity","Severity","select",{options:["minor","major","critical"],defaultValue:"minor"}),F("defect_code","Defect code","text",{required:true}),F("description","Description","textarea",{required:true}),F("disposition","Disposition","select",{options:["use_as_is","rework","scrap","return_to_supplier","hold","concession"]}),F("status","Status","select",{options:["open","investigating","dispositioned","closed"],defaultValue:"open"}),F("root_cause","Root cause","textarea"),F("containment_action","Containment","textarea")],columns:["nc_number","severity","defect_code","disposition","status","created_at"],statusField:"status",statusOptions:["open","investigating","dispositioned","closed"],orderBy:"created_at"},
    ],
  },
  {
    key:"maintenance",title:"Maintenance & Assets",icon:Wrench,entities:[
      {key:"assets",table:"maintenance_assets",title:"Maintenance Assets",description:"Machine/asset register with criticality and service state.",fields:[F("asset_code","Asset code","text",{required:true}),F("asset_name","Asset name","text",{required:true}),F("asset_type","Asset type","text",{required:true}),F("serial_number","Serial number"),F("manufacturer","Manufacturer"),F("model_number","Model"),F("work_center_id","Work centre ID"),F("criticality","Criticality","select",{options:["low","medium","high","critical"],defaultValue:"medium"}),F("status","Status","select",{options:["active","inactive","under_maintenance","retired"],defaultValue:"active"}),F("acquisition_cost","Acquisition cost","number",{defaultValue:"0"}),F("next_service_at","Next service","datetime")],columns:["asset_code","asset_name","asset_type","criticality","status","next_service_at"],statusField:"status",statusOptions:["active","inactive","under_maintenance","retired"],orderBy:"asset_code"},
      {key:"maintenance-plans",table:"maintenance_plans",title:"Preventive Maintenance Plans",description:"Calendar, meter or condition-based maintenance schedules.",fields:[F("asset_id","Asset ID","text",{required:true}),F("code","Plan code","text",{required:true}),F("name","Name","text",{required:true}),F("frequency_type","Frequency","select",{options:["calendar","meter","condition"],defaultValue:"calendar"}),F("frequency_value","Frequency value","number"),F("frequency_unit","Unit","text"),F("next_due_at","Next due","datetime"),F("active","Active","select",{options:["true","false"],defaultValue:"true"}),F("checklist","Checklist (JSON)","textarea",{defaultValue:"[]"})],columns:["code","name","frequency_type","frequency_value","frequency_unit","next_due_at","active"],orderBy:"code"},
      {key:"maintenance-wo",table:"maintenance_work_orders",title:"Maintenance Work Orders",description:"Breakdown, preventive and corrective work with downtime/cost capture.",fields:[F("work_order_number","Work order","text",{required:true}),F("asset_id","Asset ID","text",{required:true}),F("maintenance_type","Type","select",{options:["preventive","breakdown","corrective","inspection","calibration"],defaultValue:"breakdown"}),F("priority","Priority","select",{options:["low","medium","high","emergency"],defaultValue:"medium"}),F("status","Status","select",{options:["open","assigned","in_progress","waiting_parts","completed","cancelled"],defaultValue:"open"}),F("assigned_to","Assigned employee ID"),F("failure_code","Failure code"),F("root_cause","Root cause","textarea"),F("resolution","Resolution","textarea"),F("downtime_minutes","Downtime minutes","number",{defaultValue:"0"}),F("labor_cost","Labour cost","number",{defaultValue:"0"}),F("parts_cost","Parts cost","number",{defaultValue:"0"}),F("other_cost","Other cost","number",{defaultValue:"0"})],columns:["work_order_number","maintenance_type","priority","status","downtime_minutes","labor_cost","parts_cost"],statusField:"status",statusOptions:["open","assigned","in_progress","waiting_parts","completed","cancelled"],orderBy:"reported_at"},
    ],
  },
  {
    key:"plm",title:"PLM / Engineering",icon:GitBranch,entities:[
      {key:"bom-revisions",table:"bom_revisions",title:"BOM Revisions",description:"Effective-dated product BOM control and release states.",fields:[F("model_id","Product model ID","text",{required:true}),F("revision","Revision","text",{required:true}),F("status","Status","select",{options:["draft","review","approved","released","obsolete"],defaultValue:"draft"}),F("effective_from","Effective from","date"),F("effective_to","Effective to","date"),F("change_summary","Change summary","textarea")],columns:["revision","status","effective_from","effective_to","change_summary"],statusField:"status",statusOptions:["draft","review","approved","released","obsolete"],orderBy:"created_at"},
      {key:"ecos",table:"engineering_change_orders",title:"Engineering Change Orders",description:"Controlled change request and release register.",fields:[F("eco_number","ECO number","text",{required:true}),F("title","Title","text",{required:true}),F("reason","Reason","textarea"),F("priority","Priority","select",{options:["low","medium","high","critical"],defaultValue:"medium"}),F("status","Status","select",{options:["draft","review","approved","released","rejected","cancelled"],defaultValue:"draft"}),F("effective_from","Effective from","date")],columns:["eco_number","title","priority","status","effective_from"],statusField:"status",statusOptions:["draft","review","approved","released","rejected","cancelled"],orderBy:"created_at"},
    ],
  },
  {
    key:"procurement",title:"Strategic Procurement",icon:ShoppingCart,entities:[
      {key:"rfqs",table:"rfqs",title:"RFQs",description:"Request-for-quotation lifecycle before purchase orders/bills.",fields:[F("rfq_number","RFQ number","text",{required:true}),F("title","Title","text",{required:true}),F("status","Status","select",{options:["draft","sent","quoted","evaluating","awarded","closed","cancelled"],defaultValue:"draft"}),F("issue_date","Issue date","date"),F("response_due_date","Response due","date"),F("buyer_id","Buyer ID"),F("currency_code","Currency","text",{defaultValue:"INR"}),F("notes","Notes","textarea")],columns:["rfq_number","title","status","issue_date","response_due_date","currency_code"],statusField:"status",statusOptions:["draft","sent","quoted","evaluating","awarded","closed","cancelled"],orderBy:"created_at"},
      {key:"supplier-quotes",table:"supplier_quotes",title:"Supplier Quotes",description:"Supplier quotation comparison inputs and award state.",fields:[F("rfq_id","RFQ ID","text",{required:true}),F("supplier_id","Supplier ID","text",{required:true}),F("quote_number","Quote number"),F("quote_date","Quote date","date"),F("valid_until","Valid until","date"),F("payment_terms","Payment terms"),F("delivery_days","Delivery days","number"),F("freight","Freight","number",{defaultValue:"0"}),F("other_charges","Other charges","number",{defaultValue:"0"}),F("status","Status","select",{options:["received","shortlisted","awarded","rejected","expired"],defaultValue:"received"}),F("total_value","Total value","number",{defaultValue:"0"})],columns:["supplier_id","quote_number","quote_date","valid_until","delivery_days","status","total_value"],statusField:"status",statusOptions:["received","shortlisted","awarded","rejected","expired"],orderBy:"quote_date"},
    ],
  },
  {
    key:"warehouse",title:"Warehouse & Inventory Controls",icon:Warehouse,entities:[
      {key:"zones",table:"warehouse_zones",title:"Warehouse Zones",description:"Warehouse zone master for controlled putaway and picking.",fields:[F("warehouse_id","Warehouse/Godown ID","text",{required:true}),F("code","Zone code","text",{required:true}),F("name","Name","text",{required:true}),F("zone_type","Type","text",{defaultValue:"storage"}),F("active","Active","select",{options:["true","false"],defaultValue:"true"})],columns:["code","name","zone_type","active"],orderBy:"code"},
      {key:"bins",table:"warehouse_bins",title:"Warehouse Bins",description:"Bin-level location master and capacity.",fields:[F("zone_id","Zone ID","text",{required:true}),F("code","Bin code","text",{required:true}),F("name","Name","text",{required:true}),F("capacity_qty","Capacity","number",{defaultValue:"0"}),F("active","Active","select",{options:["true","false"],defaultValue:"true"})],columns:["code","name","capacity_qty","active"],orderBy:"code"},
      {key:"stock-counts",table:"stock_counts",title:"Cycle Counts",description:"Physical count control and variance investigation.",fields:[F("count_number","Count number","text",{required:true}),F("godown_id","Godown ID"),F("count_date","Count date","date",{required:true}),F("status","Status","select",{options:["draft","in_progress","review","posted","cancelled"],defaultValue:"draft"}),F("notes","Notes","textarea")],columns:["count_number","count_date","status","notes"],statusField:"status",statusOptions:["draft","in_progress","review","posted","cancelled"],orderBy:"count_date"},
    ],
  },
  {
    key:"finance",title:"Finance Controls",icon:Landmark,entities:[
      {key:"budgets",table:"budgets",title:"Budgets",description:"Versioned budget header and approval state.",fields:[F("budget_code","Budget code","text",{required:true}),F("name","Name","text",{required:true}),F("fiscal_year_id","Financial year ID"),F("status","Status","select",{options:["draft","submitted","approved","locked","closed"],defaultValue:"draft"}),F("version","Version","number",{defaultValue:"1"}),F("currency_code","Currency","text",{defaultValue:"INR"})],columns:["budget_code","name","version","status","currency_code"],statusField:"status",statusOptions:["draft","submitted","approved","locked","closed"],orderBy:"created_at"},
      {key:"bank-reconciliations",table:"bank_reconciliations",title:"Bank Reconciliations",description:"Statement-to-book reconciliation control.",fields:[F("bank_account_id","Bank account ID","text",{required:true}),F("reconciliation_number","Reconciliation number","text",{required:true}),F("statement_date","Statement date","date",{required:true}),F("opening_balance","Opening balance","number",{defaultValue:"0"}),F("closing_balance","Closing balance","number",{defaultValue:"0"}),F("book_balance","Book balance","number",{defaultValue:"0"}),F("difference","Difference","number",{defaultValue:"0"}),F("status","Status","select",{options:["open","review","reconciled","locked"],defaultValue:"open"})],columns:["reconciliation_number","statement_date","opening_balance","closing_balance","book_balance","difference","status"],statusField:"status",statusOptions:["open","review","reconciled","locked"],orderBy:"statement_date"},
      {key:"fixed-assets",table:"fixed_assets",title:"Fixed Assets",description:"Asset register for depreciation and disposal controls.",fields:[F("asset_code","Asset code","text",{required:true}),F("asset_name","Asset name","text",{required:true}),F("category","Category","text",{required:true}),F("serial_number","Serial number"),F("acquisition_date","Acquisition date","date",{required:true}),F("acquisition_cost","Acquisition cost","number",{required:true}),F("residual_value","Residual value","number",{defaultValue:"0"}),F("useful_life_months","Useful life months","number",{defaultValue:"60"}),F("status","Status","select",{options:["draft","active","disposed","impaired"],defaultValue:"active"})],columns:["asset_code","asset_name","category","acquisition_date","acquisition_cost","useful_life_months","status"],statusField:"status",statusOptions:["draft","active","disposed","impaired"],orderBy:"acquisition_date"},
    ],
  },
  {
    key:"crm",title:"CRM & Pipeline",icon:Users,entities:[
      {key:"leads",table:"crm_leads",title:"Leads",description:"Lead qualification and conversion pipeline.",fields:[F("lead_number","Lead number","text",{required:true}),F("name","Name","text",{required:true}),F("company_name","Company"),F("email","Email"),F("phone","Phone"),F("source","Source"),F("status","Status","select",{options:["new","qualified","contacted","converted","lost","junk"],defaultValue:"new"}),F("estimated_value","Estimated value","number",{defaultValue:"0"}),F("expected_close_date","Expected close","date"),F("notes","Notes","textarea")],columns:["lead_number","name","company_name","source","status","estimated_value","expected_close_date"],statusField:"status",statusOptions:["new","qualified","contacted","converted","lost","junk"],orderBy:"created_at"},
      {key:"opportunities",table:"crm_opportunities",title:"Opportunities",description:"Weighted pipeline and won/lost management.",fields:[F("opportunity_number","Opportunity number","text",{required:true}),F("party_id","Customer/party ID"),F("lead_id","Lead ID"),F("name","Name","text",{required:true}),F("stage","Stage","select",{options:["qualification","needs_analysis","proposal","negotiation","closed_won","closed_lost"],defaultValue:"qualification"}),F("probability_pct","Probability %","number",{defaultValue:"10"}),F("amount","Amount","number",{defaultValue:"0"}),F("expected_close_date","Expected close","date"),F("status","Status","select",{options:["open","won","lost","on_hold"],defaultValue:"open"}),F("lost_reason","Lost reason","textarea")],columns:["opportunity_number","name","stage","probability_pct","amount","expected_close_date","status"],statusField:"status",statusOptions:["open","won","lost","on_hold"],orderBy:"created_at"},
      {key:"activities",table:"crm_activities",title:"CRM Activities",description:"Calls, meetings, tasks, emails and notes.",fields:[F("activity_type","Type","select",{options:["call","meeting","email","task","note"],defaultValue:"task"}),F("subject","Subject","text",{required:true}),F("due_at","Due","datetime"),F("party_id","Party ID"),F("lead_id","Lead ID"),F("opportunity_id","Opportunity ID"),F("notes","Notes","textarea")],columns:["activity_type","subject","due_at","completed_at","created_at"],orderBy:"due_at"},
    ],
  },
  {
    key:"logistics",title:"Logistics & Returns",icon:Truck,entities:[
      {key:"shipments",table:"shipments",title:"Shipments",description:"Pack, dispatch, in-transit, delivery and return tracking.",fields:[F("shipment_number","Shipment number","text",{required:true}),F("sales_order_id","Sales order ID"),F("party_id","Party ID"),F("shipment_date","Shipment date","date"),F("promised_date","Promised date","date"),F("transporter_name","Transporter"),F("tracking_number","Tracking number"),F("status","Status","select",{options:["draft","packed","dispatched","in_transit","delivered","cancelled","returned"],defaultValue:"draft"}),F("freight_amount","Freight","number",{defaultValue:"0"})],columns:["shipment_number","shipment_date","promised_date","transporter_name","tracking_number","status"],statusField:"status",statusOptions:["draft","packed","dispatched","in_transit","delivered","cancelled","returned"],orderBy:"shipment_date"},
      {key:"returns",table:"sales_returns",title:"Sales Returns",description:"Return approval, receipt, inspection and posting control.",fields:[F("return_number","Return number","text",{required:true}),F("invoice_id","Invoice ID"),F("party_id","Party ID"),F("return_date","Return date","date",{required:true}),F("reason_code","Reason"),F("status","Status","select",{options:["draft","approved","received","inspected","posted","rejected","cancelled"],defaultValue:"draft"}),F("refund_method","Refund method"),F("total_value","Total value","number",{defaultValue:"0"})],columns:["return_number","return_date","reason_code","status","refund_method","total_value"],statusField:"status",statusOptions:["draft","approved","received","inspected","posted","rejected","cancelled"],orderBy:"return_date"},
    ],
  },
  {
    key:"projects",title:"Projects & Tasks",icon:BriefcaseBusiness,entities:[
      {key:"projects",table:"projects",title:"Projects",description:"Project execution, budget and actual tracking.",fields:[F("project_code","Project code","text",{required:true}),F("name","Name","text",{required:true}),F("party_id","Party ID"),F("manager_id","Manager ID"),F("start_date","Start","date"),F("end_date","End","date"),F("status","Status","select",{options:["planned","active","on_hold","completed","cancelled"],defaultValue:"planned"}),F("budget_amount","Budget","number",{defaultValue:"0"}),F("description","Description","textarea")],columns:["project_code","name","start_date","end_date","status","budget_amount","actual_amount"],statusField:"status",statusOptions:["planned","active","on_hold","completed","cancelled"],orderBy:"created_at"},
      {key:"project-tasks",table:"project_tasks",title:"Project Tasks",description:"Task execution, dependencies, assignees and completion.",fields:[F("project_id","Project ID","text",{required:true}),F("task_code","Task code","text",{required:true}),F("name","Name","text",{required:true}),F("start_date","Start","date"),F("due_date","Due","date"),F("status","Status","select",{options:["todo","in_progress","blocked","done","cancelled"],defaultValue:"todo"}),F("priority","Priority","select",{options:["low","medium","high","critical"],defaultValue:"medium"}),F("assignee_id","Assignee ID"),F("estimated_hours","Estimated hours","number",{defaultValue:"0"}),F("percent_complete","Complete %","number",{defaultValue:"0"})],columns:["task_code","name","due_date","status","priority","estimated_hours","percent_complete"],statusField:"status",statusOptions:["todo","in_progress","blocked","done","cancelled"],orderBy:"due_date"},
    ],
  },
  {
    key:"workflow",title:"Workflow & Governance",icon:Workflow,entities:[
      {key:"workflow-definitions",table:"workflow_definitions",title:"Workflow Definitions",description:"Versioned approval definitions for governed business processes.",fields:[F("code","Code","text",{required:true}),F("name","Name","text",{required:true}),F("entity_type","Entity type","text",{required:true}),F("active","Active","select",{options:["true","false"],defaultValue:"true"}),F("version","Version","number",{defaultValue:"1"}),F("definition","Definition (JSON)","textarea",{defaultValue:"{}"})],columns:["code","name","entity_type","active","version"],orderBy:"created_at"},
      {key:"workflow-instances",table:"workflow_instances",title:"Workflow Instances",description:"Live approval instances and current step.",fields:[F("workflow_definition_id","Definition ID","text",{required:true}),F("entity_type","Entity type","text",{required:true}),F("entity_id","Entity ID","text",{required:true}),F("status","Status","select",{options:["pending","in_progress","approved","rejected","cancelled"],defaultValue:"pending"}),F("current_step","Current step")],columns:["entity_type","entity_id","status","current_step","initiated_at","completed_at"],statusField:"status",statusOptions:["pending","in_progress","approved","rejected","cancelled"],orderBy:"initiated_at"},
      {key:"data-quality",table:"data_quality_issues",title:"Data Quality Issues",description:"Central exception register for master and transaction data quality.",fields:[F("entity_type","Entity type","text",{required:true}),F("entity_id","Entity ID"),F("rule_code","Rule code","text",{required:true}),F("severity","Severity","select",{options:["info","warning","critical"],defaultValue:"warning"}),F("message","Message","textarea",{required:true}),F("status","Status","select",{options:["open","acknowledged","resolved","ignored"],defaultValue:"open"}),F("details","Details (JSON)","textarea",{defaultValue:"{}"})],columns:["entity_type","rule_code","severity","message","status","detected_at"],statusField:"status",statusOptions:["open","acknowledged","resolved","ignored"],orderBy:"detected_at"},
    ],
  },
  {
    key:"ai",title:"AI & Data Freshness",icon:Sparkles,entities:[
      {key:"freshness",table:"ai_data_freshness",title:"Source Freshness",description:"Prevents stale or failed integrations from masquerading as current data.",fields:[F("source_system","Source system","text",{required:true}),F("source_scope","Scope","text",{defaultValue:"erp"}),F("status","Status","select",{options:["current","pending","stale","failed","unknown"],defaultValue:"unknown"}),F("last_success_at","Last success","datetime"),F("last_attempt_at","Last attempt","datetime"),F("watermark","Watermark"),F("record_count","Record count","number"),F("error_message","Error","textarea")],columns:["source_system","source_scope","status","last_success_at","last_attempt_at","record_count","error_message"],statusField:"status",statusOptions:["current","pending","stale","failed","unknown"],orderBy:"updated_at"},
    ],
  },
];

function EnterpriseWorkbench() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const [activeModule, setActiveModule] = useState(MODULES[0].key);
  if (companyLoading) return <PageBody><p className="text-sm text-muted-foreground">Loading company context…</p></PageBody>;
  if (!activeCompany) return <PageBody><Card><CardContent className="p-6 text-sm text-muted-foreground">No active company is available.</CardContent></Card></PageBody>;
  const module = MODULES.find((m) => m.key === activeModule) ?? MODULES[0];

  return (
    <>
      <PageHeader title="Enterprise Workbench" description="Actual operational records, lifecycle controls and exception management for the enterprise capability layer." />
      <PageBody>
        <Card className="mb-5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="text-sm font-semibold">{activeCompany.display_name}</div>
              <div className="text-xs text-muted-foreground">All records are scoped to the active company by RLS.</div>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground"><Database className="h-4 w-4" /> Additive: posted accounting, inventory and Tally ledgers remain authoritative.</div>
          </CardContent>
        </Card>
        <Tabs value={activeModule} onValueChange={setActiveModule}>
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            {MODULES.map((m) => { const Icon=m.icon; return <TabsTrigger key={m.key} value={m.key} className="gap-1"><Icon className="h-3.5 w-3.5" />{m.title}</TabsTrigger>; })}
          </TabsList>
          {MODULES.map((m) => <TabsContent key={m.key} value={m.key} className="mt-5 space-y-5">{m.entities.map((e)=><EntityPanel key={e.key} config={e} companyId={activeCompany.id} />)}</TabsContent>)}
        </Tabs>
      </PageBody>
    </>
  );
}

function EntityPanel({ config, companyId }: { config: EntityConfig; companyId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string,string>>(() => Object.fromEntries(config.fields.map(f => [f.key, f.defaultValue ?? ""])));
  const db = supabase as any;

  const { data = [], isFetching } = useQuery({
    queryKey: ["enterprise-workbench", companyId, config.table],
    queryFn: async () => {
      const { data, error } = await db.from(config.table).select("*").eq("company_id", companyId).order(config.orderBy ?? "created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    },
    staleTime: 10_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { company_id: companyId };
      for (const field of config.fields) {
        const raw = form[field.key] ?? "";
        if (!raw && field.required) throw new Error(field.label + " is required.");
        if (!raw) continue;
        if (field.type === "number") payload[field.key] = Number(raw);
        else if (field.type === "select" && (raw === "true" || raw === "false")) payload[field.key] = raw === "true";
        else if ((field.key === "planning_parameters" || field.key === "acceptance_rule" || field.key === "checklist" || field.key === "definition" || field.key === "details") && raw) {
          try { payload[field.key] = JSON.parse(raw); } catch { throw new Error(field.label + " must be valid JSON."); }
        } else payload[field.key] = raw;
      }
      const query = editing ? db.from(config.table).update(payload).eq("id", editing.id).eq("company_id", companyId) : db.from(config.table).insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editing ? "Record updated." : "Record created.");
      setOpen(false); setEditing(null);
      setForm(Object.fromEntries(config.fields.map(f => [f.key, f.defaultValue ?? ""])));
      qc.invalidateQueries({ queryKey: ["enterprise-workbench", companyId, config.table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(config.table).delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Record deleted."); qc.invalidateQueries({ queryKey: ["enterprise-workbench", companyId, config.table] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!config.statusField) return;
      const { error } = await db.from(config.table).update({ [config.statusField]: status }).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lifecycle status updated."); qc.invalidateQueries({ queryKey: ["enterprise-workbench", companyId, config.table] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data as Record<string, unknown>[];
  const openNew = () => {
    setEditing(null); setForm(Object.fromEntries(config.fields.map(f => [f.key, f.defaultValue ?? ""]))); setOpen(true);
  };
  const openEdit = (row: Record<string, unknown>) => {
    setEditing(row);
    setForm(Object.fromEntries(config.fields.map(f => [f.key, row[f.key] == null ? "" : typeof row[f.key] === "object" ? JSON.stringify(row[f.key]) : String(row[f.key]))]));
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{config.title}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{config.description}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>qc.invalidateQueries({queryKey:["enterprise-workbench",companyId,config.table]})}><RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button><Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" />New</Button></div></div></CardHeader>
      <CardContent>
        {open && <div className="mb-5 rounded-lg border bg-muted/20 p-4"><div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">{editing ? "Edit record" : "Create record"}</div><Button size="sm" variant="ghost" onClick={()=>setOpen(false)}>Close</Button></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{config.fields.map(field=><FieldEditor key={field.key} field={field} value={form[field.key] ?? ""} onChange={v=>setForm(s=>({...s,[field.key]:v}))}/>)}</div><div className="mt-4 flex justify-end"><Button onClick={()=>save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1"/>{save.isPending ? "Saving…" : "Save"}</Button></div></div>}
        <div className="overflow-x-auto rounded-md border"><table className="w-full text-xs"><thead><tr className="border-b bg-muted/30">{config.columns.map(c=><th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium">{c.replaceAll("_"," ")}</th>)}<th className="px-3 py-2 text-right">Actions</th></tr></thead><tbody>{rows.length===0 ? <tr><td colSpan={config.columns.length+1} className="px-3 py-8 text-center text-muted-foreground">No records yet.</td></tr> : rows.map(row=><tr key={String(row.id)} className="border-b last:border-0"><>{config.columns.map(c=><td key={c} className="max-w-[260px] truncate px-3 py-2">{formatCell(row[c])}</td>)}</><td className="whitespace-nowrap px-3 py-2 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={()=>openEdit(row)}>Edit</Button>{config.statusField && config.statusOptions && <Select value={String(row[config.statusField] ?? "")} onValueChange={status => statusMutation.mutate({id:String(row.id),status})}><SelectTrigger className="h-8 w-[130px]"><SelectValue/></SelectTrigger><SelectContent>{config.statusOptions.map(s=><SelectItem key={s} value={s}>{s.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select>}<Button size="icon" variant="ghost" onClick={()=>{if(confirm("Delete this record?")) remove.mutate(String(row.id));}}><Trash2 className="h-3.5 w-3.5"/></Button></div></td></tr>)}</tbody></table></div>
        <div className="mt-2 text-[11px] text-muted-foreground">Showing up to 50 records. Lifecycle updates are auditable domain changes; posted accounting/inventory transactions are not modified here.</div>
      </CardContent>
    </Card>
  );
}

function FieldEditor({ field, value, onChange }: { field: Field; value: string; onChange: (v:string)=>void }) {
  const id = "field-" + field.key;
  return <div className={field.type==="textarea" ? "md:col-span-2 lg:col-span-3" : ""}><Label htmlFor={id} className="text-xs">{field.label}{field.required ? " *" : ""}</Label>{field.type==="textarea" ? <Textarea id={id} value={value} placeholder={field.placeholder} onChange={e=>onChange(e.target.value)} rows={3}/> : field.type==="select" ? <Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue placeholder={field.placeholder ?? "Select"} /></SelectTrigger><SelectContent>{(field.options ?? []).map(o=><SelectItem key={o} value={o}>{o.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select> : <Input id={id} type={field.type==="number" ? "number" : field.type==="date" ? "date" : field.type==="datetime" ? "datetime-local" : "text"} value={value} placeholder={field.placeholder} onChange={e=>onChange(e.target.value)}/>}</div>;
}

function formatCell(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
