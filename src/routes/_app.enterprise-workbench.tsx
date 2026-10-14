import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, RefreshCw, Save, Trash2, Factory, ClipboardCheck, Wrench, GitBranch, ShoppingCart, Warehouse, Landmark, Users, Truck, BriefcaseBusiness, Workflow, Sparkles, Database, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { canSetWorkbenchStatus, getWorkbenchSearchColumns, isGovernedWorkbenchStatus, normalizeWorkbenchSearch, validateQualityInspection } from "@/lib/enterprise-workbench-guards";
import { validateCapaActionCompletion } from "@/lib/capa-action-guards";
import { validateMaintenanceCompletion } from "@/lib/maintenance-work-order-guards";

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
  readOnly?: boolean;
  readOnlyReason?: string;
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
      { key: "mrp-runs", table: "mrp_runs", title: "MRP Runs", description: "Planning snapshots only; automated material netting and planned-order generation are not yet enabled.", readOnly: true, readOnlyReason: "MRP execution is read-only until BOM explosion, material netting, lead times and planned-order generation are implemented and validated.", fields: [F("run_number","Run number","text",{required:true}),F("plan_id","MPS plan ID"),F("horizon_start","Start","date",{required:true}),F("horizon_end","End","date",{required:true}),F("status","Status","select",{options:["running","completed","failed","cancelled"],defaultValue:"running"}),F("planning_parameters","Planning parameters (JSON)","textarea",{defaultValue:"{}"})], columns:["run_number","horizon_start","horizon_end","status","run_at"], statusField:"status", statusOptions:["running","completed","failed","cancelled"], orderBy:"run_at" },
      { key: "production-operations", table: "production_operations", title: "Production Operations", description: "Operation-level WIP, good output, scrap, rework and downtime.", fields: [F("production_order_id","Production order ID","text",{required:true}),F("sequence_no","Sequence","number",{required:true,defaultValue:"10"}),F("status","Status","select",{options:["pending","ready","running","paused","completed","blocked","cancelled"],defaultValue:"pending"}),F("planned_qty","Planned qty","number",{defaultValue:"0"}),F("good_qty","Good qty","number",{defaultValue:"0"}),F("scrap_qty","Scrap qty","number",{defaultValue:"0"}),F("rework_qty","Rework qty","number",{defaultValue:"0"}),F("downtime_minutes","Downtime minutes","number",{defaultValue:"0"}),F("notes","Notes","textarea")], columns:["sequence_no","status","planned_qty","good_qty","scrap_qty","rework_qty","downtime_minutes"], statusField:"status", statusOptions:["pending","ready","running","paused","completed","blocked","cancelled"], orderBy:"sequence_no" },
    ],
  },
  {
    key: "quality", title: "Quality", icon: ClipboardCheck, entities: [
      { key: "quality-plans", table:"quality_plans", title:"Inspection Plans", description:"Controlled inspection plans and acceptance rules.", fields:[F("code","Code","text",{required:true}),F("name","Name","text",{required:true}),F("model_id","Product model ID"),F("revision","Revision","text",{defaultValue:"1"}),F("status","Status","select",{options:["draft","approved","obsolete"],defaultValue:"draft"}),F("sampling_method","Sampling","select",{options:["100_percent","aql","skip_lot","first_article"],defaultValue:"100_percent"}),F("acceptance_rule","Acceptance rule (JSON)","textarea",{defaultValue:"{}"})], columns:["code","name","revision","status","sampling_method"], statusField:"status", statusOptions:["draft","approved","obsolete"], orderBy:"code" },
      { key:"quality-inspections",table:"quality_inspections",title:"Inspections",description:"In-process, incoming and final inspection records.",fields:[F("inspection_number","Inspection number","text",{required:true}),F("quality_plan_id","Quality plan ID"),F("production_order_id","Production order ID"),F("purchase_bill_id","Purchase bill ID"),F("stage","Stage","text",{required:true,placeholder:"incoming / in-process / final"}),F("quantity_inspected","Inspected qty","number",{defaultValue:"0"}),F("quantity_accepted","Accepted qty","number",{defaultValue:"0"}),F("quantity_rejected","Rejected qty","number",{defaultValue:"0"}),F("status","Status","select",{options:["open","passed","failed","conditional","cancelled"],defaultValue:"open"}),F("notes","Notes","textarea")],columns:["inspection_number","stage","quantity_inspected","quantity_accepted","quantity_rejected","status"],statusField:"status",statusOptions:["open","passed","failed","conditional","cancelled"],orderBy:"inspected_at"},
      { key:"quality-nc",table:"quality_nonconformances",title:"Nonconformances / CAPA",description:"Defect containment, disposition and root-cause control.",fields:[F("nc_number","NC number","text",{required:true}),F("inspection_id","Inspection ID"),F("production_order_id","Production order ID"),F("supplier_id","Supplier ID"),F("severity","Severity","select",{options:["minor","major","critical"],defaultValue:"minor"}),F("defect_code","Defect code","text",{required:true}),F("description","Description","textarea",{required:true}),F("disposition","Disposition","select",{options:["use_as_is","rework","scrap","return_to_supplier","hold","concession"]}),F("status","Status","select",{options:["open","investigating","dispositioned","closed"],defaultValue:"open"}),F("root_cause","Root cause","textarea"),F("containment_action","Containment","textarea")],columns:["nc_number","severity","defect_code","disposition","status","created_at"],statusField:"status",statusOptions:["open","investigating","dispositioned","closed"],orderBy:"created_at"},
      { key:"quality-capa-actions",table:"quality_capa_actions",title:"CAPA Actions",description:"Containment, corrective/preventive actions and effectiveness verification. Completion requires an effectiveness result.",fields:[F("nc_id","Nonconformance ID","text",{required:true}),F("action_type","Action type","select",{options:["containment","corrective","preventive","verification"],defaultValue:"corrective"}),F("action_text","Action","textarea",{required:true}),F("owner_id","Owner employee ID"),F("due_date","Due date","date"),F("status","Status","select",{options:["open","in_progress","done","overdue","cancelled"],defaultValue:"open"}),F("effectiveness_result","Effectiveness result","textarea")],columns:["nc_id","action_type","action_text","owner_id","due_date","status","completed_at"],statusField:"status",statusOptions:["open","in_progress","done","overdue","cancelled"],orderBy:"due_date"},
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
      {key:"zones",table:"warehouse_zones",title:"Warehouse Zones",description:"Warehouse zones linked to an existing godown.",fields:[F("godown_id","Godown ID","text",{required:true}),F("code","Zone code","text",{required:true}),F("name","Name","text",{required:true}),F("active","Active","select",{options:["true","false"],defaultValue:"true"})],columns:["code","name","godown_id","active"],orderBy:"code"},
      {key:"bins",table:"warehouse_bins",title:"Warehouse Bins",description:"Bin-level location master and capacity.",fields:[F("zone_id","Zone ID","text",{required:true}),F("code","Bin code","text",{required:true}),F("name","Name","text",{required:true}),F("capacity","Capacity","number",{defaultValue:"0"}),F("active","Active","select",{options:["true","false"],defaultValue:"true"})],columns:["code","name","capacity","active"],orderBy:"code"},
      {key:"stock-counts",table:"stock_counts",title:"Cycle Counts",description:"Physical count control; posting remains in the stock-count workflow.",fields:[F("count_number","Count number","text",{required:true}),F("godown_id","Godown ID"),F("count_date","Count date","date",{required:true}),F("count_type","Count type","select",{options:["cycle","annual","spot"],defaultValue:"cycle"}),F("blind_count","Blind count","select",{options:["true","false"],defaultValue:"false"}),F("status","Status","select",{options:["draft","in_progress","review","posted","cancelled"],defaultValue:"draft"})],columns:["count_number","count_date","count_type","status","blind_count"],statusField:"status",statusOptions:["draft","in_progress","review","posted","cancelled"],orderBy:"count_date"},
    ],
  },
  {
    key:"finance",title:"Finance Controls",icon:Landmark,entities:[
      {key:"budgets",table:"budgets",title:"Budgets",description:"Budget header with controlled status; use the supported budget process for approval.",fields:[F("code","Budget code","text",{required:true}),F("name","Name","text",{required:true}),F("financial_year_id","Financial year ID"),F("start_date","Start date","date"),F("end_date","End date","date"),F("status","Status","select",{options:["draft","submitted","approved","locked","closed"],defaultValue:"draft"}),F("currency_code","Currency","text",{defaultValue:"INR"}),F("notes","Notes","textarea")],columns:["code","name","start_date","end_date","status","currency_code"],statusField:"status",statusOptions:["draft","submitted","approved","locked","closed"],orderBy:"created_at"},
      {key:"bank-reconciliations",table:"bank_reconciliations",title:"Bank Reconciliations",description:"Statement-to-book reconciliation control.",fields:[F("bank_account_id","Bank account ID","text",{required:true}),F("reconciliation_number","Reconciliation number","text",{required:true}),F("statement_date","Statement date","date",{required:true}),F("opening_balance","Opening balance","number",{defaultValue:"0"}),F("closing_balance","Closing balance","number",{defaultValue:"0"}),F("book_balance","Book balance","number",{defaultValue:"0"}),F("difference","Difference","number",{defaultValue:"0"}),F("status","Status","select",{options:["open","review","reconciled","locked"],defaultValue:"open"})],columns:["reconciliation_number","statement_date","opening_balance","closing_balance","book_balance","difference","status"],statusField:"status",statusOptions:["open","review","reconciled","locked"],orderBy:"statement_date"},
      {key:"fixed-assets",table:"fixed_assets",title:"Fixed Assets",description:"Asset register for depreciation and disposal controls.",fields:[F("asset_code","Asset code","text",{required:true}),F("asset_name","Asset name","text",{required:true}),F("category","Category","text",{required:true}),F("serial_number","Serial number"),F("acquisition_date","Acquisition date","date",{required:true}),F("acquisition_cost","Acquisition cost","number",{required:true}),F("residual_value","Residual value","number",{defaultValue:"0"}),F("useful_life_months","Useful life months","number",{defaultValue:"60"}),F("status","Status","select",{options:["draft","active","disposed","impaired"],defaultValue:"active"})],columns:["asset_code","asset_name","category","acquisition_date","acquisition_cost","useful_life_months","status"],statusField:"status",statusOptions:["draft","active","disposed","impaired"],orderBy:"acquisition_date"},
    ],
  },
  {
    key:"crm",title:"CRM & Pipeline",icon:Users,entities:[
      {key:"leads",table:"crm_leads",title:"Leads",description:"Lead qualification pipeline using the real lead schema.",fields:[F("lead_number","Lead number","text",{required:true}),F("title","Lead title","text",{required:true}),F("party_id","Party ID"),F("source","Source"),F("status","Status","select",{options:["new","qualified","contacted","converted","lost","junk"],defaultValue:"new"}),F("owner_id","Owner ID"),F("expected_value","Expected value","number",{defaultValue:"0"}),F("probability","Probability %","number",{defaultValue:"0"}),F("next_activity_at","Next activity","datetime"),F("notes","Notes","textarea")],columns:["lead_number","title","source","status","expected_value","probability","next_activity_at"],statusField:"status",statusOptions:["new","qualified","contacted","converted","lost","junk"],orderBy:"created_at"},
      {key:"opportunities",table:"crm_opportunities",title:"Opportunities",description:"Weighted pipeline and won/lost management.",fields:[F("opportunity_number","Opportunity number","text",{required:true}),F("party_id","Customer/party ID"),F("lead_id","Lead ID"),F("name","Name","text",{required:true}),F("stage","Stage","select",{options:["qualification","needs_analysis","proposal","negotiation","closed_won","closed_lost"],defaultValue:"qualification"}),F("probability_pct","Probability %","number",{defaultValue:"10"}),F("amount","Amount","number",{defaultValue:"0"}),F("expected_close_date","Expected close","date"),F("status","Status","select",{options:["open","won","lost","on_hold"],defaultValue:"open"}),F("lost_reason","Lost reason","textarea")],columns:["opportunity_number","name","stage","probability_pct","amount","expected_close_date","status"],statusField:"status",statusOptions:["open","won","lost","on_hold"],orderBy:"created_at"},
      {key:"activities",table:"crm_activities",title:"CRM Activities",description:"Calls, meetings, tasks, emails and notes.",fields:[F("activity_type","Type","select",{options:["call","meeting","email","task","note"],defaultValue:"task"}),F("subject","Subject","text",{required:true}),F("due_at","Due","datetime"),F("party_id","Party ID"),F("lead_id","Lead ID"),F("opportunity_id","Opportunity ID"),F("notes","Notes","textarea")],columns:["activity_type","subject","due_at","completed_at","created_at"],orderBy:"due_at"},
    ],
  },
  {
    key:"logistics",title:"Logistics & Returns",icon:Truck,entities:[
      {key:"shipments",table:"shipments",title:"Shipments",description:"Shipment tracking; dispatch and delivery states require the dispatch workflow.",fields:[F("shipment_number","Shipment number","text",{required:true}),F("sales_order_id","Sales order ID"),F("invoice_id","Invoice ID"),F("party_id","Party ID"),F("shipment_date","Shipment date","date",{required:true}),F("expected_delivery","Expected delivery","date"),F("transporter_name","Transporter"),F("tracking_number","Tracking number"),F("pod_reference","Proof-of-delivery reference"),F("delivered_at","Delivered at","datetime"),F("notes","Notes","textarea"),F("status","Status","select",{options:["draft","packed","dispatched","in_transit","delivered","cancelled","returned"],defaultValue:"draft"})],columns:["shipment_number","shipment_date","expected_delivery","transporter_name","tracking_number","status"],statusField:"status",statusOptions:["draft","packed","dispatched","in_transit","delivered","cancelled","returned"],orderBy:"shipment_date"},
      {key:"returns",table:"sales_returns",title:"Sales Returns",description:"Return approval, receipt, inspection and posting control.",fields:[F("return_number","Return number","text",{required:true}),F("invoice_id","Invoice ID"),F("party_id","Party ID"),F("return_date","Return date","date",{required:true}),F("reason_code","Reason"),F("status","Status","select",{options:["draft","approved","received","inspected","posted","rejected","cancelled"],defaultValue:"draft"}),F("refund_method","Refund method"),F("total_value","Total value","number",{defaultValue:"0"})],columns:["return_number","return_date","reason_code","status","refund_method","total_value"],statusField:"status",statusOptions:["draft","approved","received","inspected","posted","rejected","cancelled"],orderBy:"return_date"},
    ],
  },
  {
    key:"projects",title:"Projects & Tasks",icon:BriefcaseBusiness,entities:[
      {key:"projects",table:"projects",title:"Projects",description:"Project execution, budget and actual tracking.",fields:[F("project_number","Project number","text",{required:true}),F("name","Name","text",{required:true}),F("owner_id","Owner ID"),F("start_date","Start","date"),F("end_date","End","date"),F("status","Status","select",{options:["planned","active","on_hold","completed","cancelled"],defaultValue:"planned"}),F("budget_amount","Budget","number",{defaultValue:"0"}),F("notes","Description / notes","textarea")],columns:["project_number","name","start_date","end_date","status","budget_amount"],statusField:"status",statusOptions:["planned","active","on_hold","completed","cancelled"],orderBy:"created_at"},
      {key:"project-tasks",table:"project_tasks",title:"Project Tasks",description:"Task execution, dependencies, assignees and completion.",fields:[F("project_id","Project ID","text",{required:true}),F("task_code","Task code","text",{required:true}),F("name","Name","text",{required:true}),F("start_date","Start","date"),F("due_date","Due","date"),F("status","Status","select",{options:["todo","in_progress","blocked","done","cancelled"],defaultValue:"todo"}),F("priority","Priority","select",{options:["low","medium","high","critical"],defaultValue:"medium"}),F("assignee_id","Assignee ID"),F("estimated_hours","Estimated hours","number",{defaultValue:"0"}),F("percent_complete","Complete %","number",{defaultValue:"0"})],columns:["task_code","name","due_date","status","priority","estimated_hours","percent_complete"],statusField:"status",statusOptions:["todo","in_progress","blocked","done","cancelled"],orderBy:"due_date"},
    ],
  },
  {
    key:"workflow",title:"Workflow & Governance",icon:Workflow,entities:[
      {key:"workflow-definitions",table:"workflow_definitions",title:"Workflow Definitions",description:"Read-only view of approval definitions until their versioned publish workflow is enabled.",readOnly:true,readOnlyReason:"Workflow definitions are read-only here to prevent manual activation of unfinished approval logic.",fields:[F("code","Code","text",{required:true}),F("name","Name","text",{required:true}),F("entity_type","Entity type","text",{required:true}),F("status","Status"),F("version","Version","number",{defaultValue:"1"}),F("definition","Definition (JSON)","textarea",{defaultValue:"{}"})],columns:["code","name","entity_type","status","version"],orderBy:"created_at"},
      {key:"workflow-instances",table:"workflow_instances",title:"Workflow Instances",description:"Read-only approval execution register; approval outcomes must come from assigned workflow tasks.",readOnly:true,readOnlyReason:"Workflow execution records cannot be created or status-edited from this generic register.",fields:[F("workflow_definition_id","Definition ID","text",{required:true}),F("entity_type","Entity type","text",{required:true}),F("entity_id","Entity ID","text",{required:true}),F("status","Status"),F("current_step","Current step")],columns:["entity_type","entity_id","status","current_step","initiated_at","completed_at"],orderBy:"initiated_at"},
      {key:"data-quality",table:"data_quality_issues",title:"Data Quality Issues",description:"Central exception register for master and transaction data quality.",fields:[F("entity_type","Entity type","text",{required:true}),F("entity_id","Entity ID"),F("rule_code","Rule code","text",{required:true}),F("severity","Severity","select",{options:["info","warning","critical"],defaultValue:"warning"}),F("message","Message","textarea",{required:true}),F("status","Status","select",{options:["open","acknowledged","resolved","ignored"],defaultValue:"open"}),F("details","Details (JSON)","textarea",{defaultValue:"{}"})],columns:["entity_type","rule_code","severity","message","status","detected_at"],statusField:"status",statusOptions:["open","acknowledged","resolved","ignored"],orderBy:"detected_at"},
    ],
  },
  {
    key:"ai",title:"AI & Data Freshness",icon:Sparkles,entities:[
      {key:"freshness",table:"ai_data_freshness",title:"AI/Data Freshness",description:"Integration-reported freshness; manual edits are disabled to preserve the source-of-truth signal.",readOnly:true,readOnlyReason:"Integration freshness records are written by connector jobs; manual changes could falsely report healthy or current data.",fields:[F("integration_code","Integration code","text",{required:true}),F("source_name","Source name","text",{required:true}),F("status","Status","select",{options:["unknown","current","stale","error","syncing"],defaultValue:"unknown"}),F("last_success_at","Last success","datetime"),F("last_attempt_at","Last attempt","datetime"),F("recorded_at","Recorded at","datetime"),F("details","Details (JSON)","textarea",{defaultValue:"{}"})],columns:["integration_code","source_name","status","last_success_at","last_attempt_at","recorded_at","details"],orderBy:"recorded_at"},
    ],
  },
];

function EnterpriseWorkbench() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const { hasAnyRole } = useAuth();
  const canManageQuality = hasAnyRole(["admin", "production"]);
  const canManageMaintenance = hasAnyRole(["admin", "production"]);
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
          {MODULES.map((m) => <TabsContent key={m.key} value={m.key} className="mt-5 space-y-5">{m.entities.map((e)=><EntityPanel key={e.key} config={e} companyId={activeCompany.id} canManageQuality={canManageQuality} canManageMaintenance={canManageMaintenance} />)}</TabsContent>)}
        </Tabs>
      </PageBody>
    </>
  );
}

function EntityPanel({ config, companyId, canManageQuality, canManageMaintenance }: { config: EntityConfig; companyId: string; canManageQuality: boolean; canManageMaintenance: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string,string>>(() => Object.fromEntries(config.fields.map(f => [f.key, f.defaultValue ?? ""])));
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all");
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 50;
  const normalizedSearch = normalizeWorkbenchSearch(searchInput);
  const searchColumns = getWorkbenchSearchColumns(config.fields);
  const db = supabase as any;
  const qualityReadOnly = ["quality-inspections", "quality-nc", "quality-capa-actions"].includes(config.key) && !canManageQuality;
  const maintenanceReadOnly = ["assets", "maintenance-plans", "maintenance-wo"].includes(config.key) && !canManageMaintenance;
  const effectiveReadOnly = Boolean(config.readOnly || qualityReadOnly || maintenanceReadOnly);

  const { data: queryData, isFetching, isLoading, isError, refetch } = useQuery({
    queryKey: ["enterprise-workbench", companyId, config.table, pageIndex, normalizedSearch, statusFilter],
    queryFn: async () => {
      let query = db.from(config.table)
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order(config.orderBy ?? "created_at", { ascending: false })
        .range(pageIndex * pageSize, pageIndex * pageSize + pageSize - 1);

      if (normalizedSearch && searchColumns.length > 0) {
        const filters = searchColumns.map(column => `${column}.ilike.%${normalizedSearch}%`).join(",");
        query = query.or(filters);
      }
      if (config.statusField && statusFilter !== "__all") {
        query = query.eq(config.statusField, statusFilter);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as Record<string, unknown>[], count: count ?? 0 };
    },
    staleTime: 10_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (["quality-inspections", "quality-nc", "quality-capa-actions"].includes(config.key) && !canManageQuality) {
        throw new Error("Only admin or production roles may manage quality records.");
      }
      if (["assets", "maintenance-plans", "maintenance-wo"].includes(config.key) && !canManageMaintenance) {
        throw new Error("Only admin or production roles may manage maintenance records.");
      }
      const payload: Record<string, unknown> = { company_id: companyId };
      for (const field of config.fields) {
        const raw = form[field.key] ?? "";
        if (!raw && field.required) throw new Error(field.label + " is required.");
        if (!raw) continue;
        if (field.type === "number") {
          const value = Number(raw);
          if (!Number.isFinite(value)) throw new Error(field.label + " must be a valid number.");
          payload[field.key] = value;
        } else if (field.type === "select" && (raw === "true" || raw === "false")) payload[field.key] = raw === "true";
        else if ((field.key === "planning_parameters" || field.key === "acceptance_rule" || field.key === "checklist" || field.key === "definition" || field.key === "details") && raw) {
          try { payload[field.key] = JSON.parse(raw); } catch { throw new Error(field.label + " must be valid JSON."); }
        } else payload[field.key] = raw;
      }
      const qualityInspectionError = config.key === "quality-inspections" ? validateQualityInspection(payload) : null;
      if (qualityInspectionError) throw new Error(qualityInspectionError);
      if (config.statusField && Object.prototype.hasOwnProperty.call(payload, config.statusField)) {
        const nextStatus = payload[config.statusField];
        const currentStatus = editing?.[config.statusField];
        const isValidatedQualityResult = config.key === "quality-inspections"
          && ["passed", "failed", "conditional"].includes(String(nextStatus).toLowerCase())
          && qualityInspectionError === null;
        if (!canSetWorkbenchStatus(nextStatus, currentStatus) && !isValidatedQualityResult) {
          throw new Error("This status requires its dedicated approval, posting, dispatch or completion workflow. The generic workbench cannot set it.");
        }
      }
      const query = editing ? db.from(config.table).update(payload).eq("id", editing.id).eq("company_id", companyId) : db.from(config.table).insert(payload);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editing ? "Record updated." : "Record created.");
      setOpen(false); setEditing(null); setPageIndex(0);
      setForm(Object.fromEntries(config.fields.map(f => [f.key, f.defaultValue ?? ""])));
      qc.invalidateQueries({ queryKey: ["enterprise-workbench", companyId, config.table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (["quality-inspections", "quality-nc", "quality-capa-actions"].includes(config.key) && !canManageQuality) {
        throw new Error("Only admin or production roles may manage quality records.");
      }
      const { error } = await db.from(config.table).delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Record deleted."); setPageIndex(0); qc.invalidateQueries({ queryKey: ["enterprise-workbench", companyId, config.table] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, currentStatus, effectivenessResult, resolution, downtimeMinutes, laborCost, partsCost, otherCost }: { id: string; status: string; currentStatus: string; effectivenessResult?: unknown; resolution?: unknown; downtimeMinutes?: unknown; laborCost?: unknown; partsCost?: unknown; otherCost?: unknown }) => {
      if (!config.statusField) return;
      const capaCompletion = config.key === "quality-capa-actions" && status === "done";
      const maintenanceCompletion = config.key === "maintenance-wo" && status === "completed";
      if (maintenanceCompletion) {
        const validationError = validateMaintenanceCompletion({ resolution, downtimeMinutes, laborCost, partsCost, otherCost });
        if (validationError) throw new Error(validationError);
      } else if (capaCompletion) {
        const validationError = validateCapaActionCompletion(effectivenessResult);
        if (validationError) throw new Error(validationError);
      } else if (!canSetWorkbenchStatus(status, currentStatus)) {
        throw new Error("Use the dedicated workflow to approve, release, post, dispatch or complete this record.");
      }
      const payload: Record<string, unknown> = { [config.statusField]: status };
      if (capaCompletion) {
        payload.effectiveness_result = String(effectivenessResult).trim();
        payload.completed_at = new Date().toISOString();
      }
      if (maintenanceCompletion) payload.completed_at = new Date().toISOString();
      const { error } = await db.from(config.table).update(payload).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Working status updated."); setPageIndex(0); qc.invalidateQueries({ queryKey: ["enterprise-workbench", companyId, config.table] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = queryData?.rows ?? [];
  const totalRows = queryData?.count ?? 0;
  const totalPages = Math.ceil(totalRows / pageSize);
  const fromRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const toRow = Math.min((pageIndex + 1) * pageSize, totalRows);
  const openNew = () => {
    setEditing(null); setForm(Object.fromEntries(config.fields.map(f => [f.key, f.defaultValue ?? ""]))); setOpen(true);
  };
  const openEdit = (row: Record<string, unknown>) => {
    setEditing(row);
    setForm(Object.fromEntries(config.fields.map(f => [f.key, row[f.key] == null ? "" : typeof row[f.key] === "object" ? JSON.stringify(row[f.key]) : String(row[f.key])])))
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{config.title}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{config.description}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>refetch()} disabled={isFetching}><RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>{!effectiveReadOnly && <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" />New</Button>}</div></div></CardHeader>
      <CardContent>
        {effectiveReadOnly && <div className="mb-3 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">{qualityReadOnly ? "Quality records are view-only for your role. Only admin or production roles may manage outcomes." : maintenanceReadOnly ? "Maintenance records are view-only for your role. Only admin or production roles may manage maintenance." : config.readOnlyReason ?? "This register is read-only until its workflow is implemented."}</div>}
        {open && <div className="mb-5 rounded-lg border bg-muted/20 p-4"><div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">{editing ? "Edit record" : "Create record"}</div><Button size="sm" variant="ghost" onClick={()=>setOpen(false)}>Close</Button></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{config.fields.map(field=><FieldEditor key={field.key} field={field} value={form[field.key] ?? ""} onChange={v=>setForm(s=>({...s,[field.key]:v}))} restrictGovernedOptions={field.key===config.statusField && config.key!=="quality-inspections"} currentStatus={editing && config.statusField ? String(editing[config.statusField] ?? "") : undefined}/>)}</div><div className="mt-4 flex justify-end"><Button onClick={()=>save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1"/>{save.isPending ? "Saving…" : "Save"}</Button></div></div>}
        <div className="mb-3 flex flex-col gap-2 md:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={`Search ${config.title}`} className="pl-9" value={searchInput} onChange={event => { setSearchInput(event.target.value); setPageIndex(0); }} placeholder="Search records by code, name, status or reference…" />
          </div>
          {config.statusField && config.statusOptions && <div className="w-full md:w-52">
            <Select value={statusFilter} onValueChange={value => { setStatusFilter(value); setPageIndex(0); }}>
              <SelectTrigger aria-label={`Filter ${config.title} by status`}><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="__all">All statuses</SelectItem>{config.statusOptions.map(status => <SelectItem key={status} value={status}>{status.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
        </div>
        {isError && <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 p-3 text-sm">
          <span>Couldn’t load {config.title.toLowerCase()}. Check your connection and access permissions, then retry.</span>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>Retry</Button>
        </div>}
        <div className="overflow-x-auto rounded-md border"><table className="w-full text-xs"><thead><tr className="border-b bg-muted/30">{config.columns.map(c=><th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium">{c.replaceAll("_"," ")}</th>)}<th className="px-3 py-2 text-right">Actions</th></tr></thead><tbody>
          {isLoading && !queryData ? <tr><td colSpan={config.columns.length+1} className="px-3 py-8 text-center text-muted-foreground">Loading records…</td></tr>
          : isError && !queryData ? <tr><td colSpan={config.columns.length+1} className="px-3 py-8 text-center text-muted-foreground">Records unavailable.</td></tr>
          : rows.length===0 ? <tr><td colSpan={config.columns.length+1} className="px-3 py-8 text-center text-muted-foreground">{normalizedSearch || statusFilter !== "__all" ? "No records match these filters." : "No records yet."}</td></tr>
          : rows.map(row => {
            const currentStatus = config.statusField ? String(row[config.statusField] ?? "") : "";
            const protectedRow = isGovernedWorkbenchStatus(currentStatus) || (config.key === "quality-capa-actions" && currentStatus === "done") || (config.key === "maintenance-wo" && currentStatus === "completed");
            return <tr key={String(row.id)} className="border-b last:border-0"><>{config.columns.map(c=><td key={c} className="max-w-[260px] truncate px-3 py-2">{formatCell(row[c])}</td>)}</><td className="whitespace-nowrap px-3 py-2 text-right"><div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" disabled={effectiveReadOnly || protectedRow} title={protectedRow ? "Use the dedicated workflow for governed records." : "Edit record"} onClick={()=>openEdit(row)}>Edit</Button>
              {!effectiveReadOnly && config.key!=="quality-inspections" && config.statusField && config.statusOptions && <Select value={currentStatus || undefined} onValueChange={status => statusMutation.mutate({id:String(row.id),status,currentStatus,effectivenessResult:row.effectiveness_result,resolution:row.resolution,downtimeMinutes:row.downtime_minutes,laborCost:row.labor_cost,partsCost:row.parts_cost,otherCost:row.other_cost})} disabled={protectedRow || statusMutation.isPending}>
                <SelectTrigger className="h-8 w-[130px]" aria-label={`Change status for ${config.title} record`}><SelectValue placeholder="Status"/></SelectTrigger>
                <SelectContent>{config.statusOptions.map(status=><SelectItem key={status} value={status} disabled={!(config.key === "quality-capa-actions" && status === "done" ? !validateCapaActionCompletion(row.effectiveness_result) : config.key === "maintenance-wo" && status === "completed" ? !validateMaintenanceCompletion({ resolution: row.resolution, downtimeMinutes: row.downtime_minutes, laborCost: row.labor_cost, partsCost: row.parts_cost, otherCost: row.other_cost }) : canSetWorkbenchStatus(status,currentStatus))}>{status.replaceAll("_"," ")}</SelectItem>)}</SelectContent>
              </Select>}
              <Button size="icon" variant="ghost" disabled={effectiveReadOnly || protectedRow || remove.isPending} title={protectedRow ? "Governed records cannot be deleted here." : "Delete record"} aria-label={`Delete ${config.title} record`} onClick={()=>{if(confirm("Delete this record?")) remove.mutate(String(row.id));}}><Trash2 className="h-3.5 w-3.5"/></Button>
            </div></td></tr>;
          })}
        </tbody></table></div>
        <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>Showing {fromRow}–{toRow} of {totalRows} matching records. Governed states (approval, release, posting, dispatch, completion and close) require their dedicated workflow.</div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={pageIndex===0 || isFetching} onClick={()=>setPageIndex(page=>Math.max(0,page-1))}><ChevronLeft className="mr-1 h-3.5 w-3.5"/>Previous</Button>
            <span className="whitespace-nowrap">Page {Math.min(pageIndex+1,Math.max(totalPages,1))} of {Math.max(totalPages,1)}</span>
            <Button size="sm" variant="outline" disabled={pageIndex+1>=totalPages || isFetching} onClick={()=>setPageIndex(page=>Math.min(Math.max(totalPages-1,0),page+1))}>Next<ChevronRight className="ml-1 h-3.5 w-3.5"/></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldEditor({ field, value, onChange, restrictGovernedOptions = false, currentStatus }: { field: Field; value: string; onChange: (v:string)=>void; restrictGovernedOptions?: boolean; currentStatus?: string }) {
  const id = "field-" + field.key;
  return <div className={field.type==="textarea" ? "md:col-span-2 lg:col-span-3" : ""}><Label htmlFor={id} className="text-xs">{field.label}{field.required ? " *" : ""}</Label>{field.type==="textarea" ? <Textarea id={id} value={value} placeholder={field.placeholder} onChange={e=>onChange(e.target.value)} rows={3}/> : field.type==="select" ? <Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue placeholder={field.placeholder ?? "Select"} /></SelectTrigger><SelectContent>{(field.options ?? []).map(option=><SelectItem key={option} value={option} disabled={restrictGovernedOptions && !canSetWorkbenchStatus(option,currentStatus)}>{option.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select> : <Input id={id} type={field.type==="number" ? "number" : field.type==="date" ? "date" : field.type==="datetime" ? "datetime-local" : "text"} value={value} placeholder={field.placeholder} onChange={e=>onChange(e.target.value)}/>}</div>;
}

function formatCell(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
