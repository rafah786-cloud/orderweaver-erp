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
import { AlertTriangle, BarChart3, CalendarRange, Megaphone, Plus, Receipt, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
type Campaign = {
  id: string; company_id: string; campaign_code: string; name: string; objective: string; channel: string;
  status: string; start_date: string | null; end_date: string | null; budget_amount: number;
  target_leads: number | null; target_conversions: number | null; target_revenue: number | null;
  landing_page_url: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
};
type Cost = { id: string; campaign_id: string; spend_date: string; amount: number; category: string; vendor: string | null; reference: string | null };
type Lead = { id: string; lead_number: string; name: string; status: string; source: string | null };
type Invoice = { id: string; invoice_number: string; invoice_date: string; total_amount: number; status: string; party_id: string | null };
type Attribution = { id: string; campaign_id: string; lead_id: string | null; invoice_id: string | null; attribution_model: string; attributed_at: string; source: string | null };

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const day = (value: string | null | undefined) => value ? new Date(value + (value.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN") : "—";
const CHANNELS = [
  ["website", "Website"], ["email", "Email"], ["whatsapp", "WhatsApp"], ["social", "Social media"],
  ["search_ads", "Search ads"], ["offline", "Offline promotion"], ["dealer", "Dealer / distributor"],
  ["retail", "Retail"], ["event", "Event"], ["referral", "Referral"], ["other", "Other"],
] as const;
const STATUSES = ["draft", "approved", "scheduled", "active", "paused", "completed", "cancelled"] as const;

export const Route = createFileRoute("/_app/marketing")({ component: MarketingPage });

function MarketingPage() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["admin", "sales"]);
  const qc = useQueryClient();
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    campaign_code: "", name: "", objective: "sales_growth", channel: "website", status: "draft",
    start_date: "", end_date: "", budget_amount: "0", target_leads: "", target_conversions: "",
    target_revenue: "", landing_page_url: "", utm_source: "", utm_medium: "", utm_campaign: "",
  });
  const [costForm, setCostForm] = useState({ campaign_id: "", spend_date: new Date().toISOString().slice(0, 10), amount: "", category: "advertising", vendor: "", reference: "" });
  const [attributionForm, setAttributionForm] = useState({ campaign_id: "", source_type: "lead", source_id: "", attribution_model: "last_touch", source: "" });

  const campaignsQuery = useQuery({
    queryKey: ["marketing-campaigns", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company to view marketing campaigns.");
      const { data, error } = await db.from("marketing_campaigns").select("*").eq("company_id", activeCompany.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });
  const costsQuery = useQuery({
    queryKey: ["marketing-costs", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company to view campaign spend.");
      const { data, error } = await db.from("marketing_campaign_costs").select("id,campaign_id,spend_date,amount,category,vendor,reference").eq("company_id", activeCompany.id).order("spend_date", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as Cost[];
    },
  });
  const attributionsQuery = useQuery({
    queryKey: ["marketing-attributions", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company to view attribution.");
      const { data, error } = await db.from("marketing_campaign_attributions").select("id,campaign_id,lead_id,invoice_id,attribution_model,attributed_at,source").eq("company_id", activeCompany.id).order("attributed_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as Attribution[];
    },
  });
  const leadsQuery = useQuery({
    queryKey: ["marketing-attribution-leads", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("crm_leads").select("id,lead_number,name,status,source").eq("company_id", activeCompany!.id).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
  const invoicesQuery = useQuery({
    queryKey: ["marketing-attribution-invoices", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      const { data, error } = await db.from("invoices").select("id,invoice_number,invoice_date,total_amount,status,party_id").eq("company_id", activeCompany!.id).neq("status", "cancelled").order("invoice_date", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const campaignById = useMemo(() => new Map((campaignsQuery.data ?? []).map(c => [c.id, c])), [campaignsQuery.data]);
  const leadById = useMemo(() => new Map((leadsQuery.data ?? []).map(l => [l.id, l])), [leadsQuery.data]);
  const invoiceById = useMemo(() => new Map((invoicesQuery.data ?? []).map(i => [i.id, i])), [invoicesQuery.data]);
  const rows = useMemo(() => (campaignsQuery.data ?? []).map(c => {
    const costs = (costsQuery.data ?? []).filter(x => x.campaign_id === c.id);
    const attributions = (attributionsQuery.data ?? []).filter(x => x.campaign_id === c.id);
    const leadCount = attributions.filter(x => x.lead_id !== null).length;
    const invoices = attributions.filter(x => x.invoice_id !== null);
    const revenue = invoices.reduce((sum, attribution) => {
      const amount = (invoiceById.get(attribution.invoice_id ?? "")?.total_amount ?? 0);
      return sum + Number(amount);
    }, 0);
    const spend = costs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { campaign: c, spend, leadCount, conversionCount: invoices.length, revenue, returnOnSpend: spend > 0 ? revenue / spend : null, costCount: costs.length };
  }), [campaignsQuery.data, costsQuery.data, attributionsQuery.data, invoiceById]);

  const totals = rows.reduce((a, r) => ({
    campaigns: a.campaigns + 1, spend: a.spend + r.spend, leads: a.leads + r.leadCount,
    conversions: a.conversions + r.conversionCount, revenue: a.revenue + r.revenue,
  }), { campaigns: 0, spend: 0, leads: 0, conversions: 0, revenue: 0 });
  const loading = companyLoading || campaignsQuery.isLoading || costsQuery.isLoading || attributionsQuery.isLoading;
  const loadError = campaignsQuery.error || costsQuery.error || attributionsQuery.error || leadsQuery.error || invoicesQuery.error;

  const createCampaign = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company first.");
      if (!campaignForm.campaign_code.trim() || !campaignForm.name.trim()) throw new Error("Campaign code and name are required.");
      const budget = Number(campaignForm.budget_amount);
      if (!Number.isFinite(budget) || budget < 0) throw new Error("Budget must be zero or greater.");
      const nullableNumber = (s: string) => s.trim() === "" ? null : Number(s);
      const payload = {
        company_id: activeCompany.id, campaign_code: campaignForm.campaign_code.trim().toUpperCase(),
        name: campaignForm.name.trim(), objective: campaignForm.objective, channel: campaignForm.channel,
        status: campaignForm.status, start_date: campaignForm.start_date || null, end_date: campaignForm.end_date || null,
        budget_amount: budget, target_leads: nullableNumber(campaignForm.target_leads),
        target_conversions: nullableNumber(campaignForm.target_conversions), target_revenue: nullableNumber(campaignForm.target_revenue),
        landing_page_url: campaignForm.landing_page_url.trim() || null, utm_source: campaignForm.utm_source.trim() || null,
        utm_medium: campaignForm.utm_medium.trim() || null, utm_campaign: campaignForm.utm_campaign.trim() || null,
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      };
      if (payload.target_leads !== null && (!Number.isInteger(payload.target_leads) || payload.target_leads < 0)) throw new Error("Target leads must be a whole number.");
      if (payload.target_conversions !== null && (!Number.isInteger(payload.target_conversions) || payload.target_conversions < 0)) throw new Error("Target conversions must be a whole number.");
      const { error } = await db.from("marketing_campaigns").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign created.");
      setCampaignOpen(false);
      setCampaignForm({ campaign_code: "", name: "", objective: "sales_growth", channel: "website", status: "draft", start_date: "", end_date: "", budget_amount: "0", target_leads: "", target_conversions: "", target_revenue: "", landing_page_url: "", utm_source: "", utm_medium: "", utm_campaign: "" });
      qc.invalidateQueries({ queryKey: ["marketing-campaigns", activeCompany?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const addCost = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id || !campaignById.has(costForm.campaign_id)) throw new Error("Select a campaign in the active company.");
      const amount = Number(costForm.amount);
      if (!costForm.amount.trim() || !Number.isFinite(amount) || amount <= 0) throw new Error("Spend amount must be greater than zero.");
      const { error } = await db.from("marketing_campaign_costs").insert({
        company_id: activeCompany.id, campaign_id: costForm.campaign_id, spend_date: costForm.spend_date,
        amount, category: costForm.category, vendor: costForm.vendor.trim() || null,
        reference: costForm.reference.trim() || null, created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign spend recorded.");
      setCostOpen(false);
      setCostForm({ campaign_id: "", spend_date: new Date().toISOString().slice(0, 10), amount: "", category: "advertising", vendor: "", reference: "" });
      qc.invalidateQueries({ queryKey: ["marketing-costs", activeCompany?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const addAttribution = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id || !campaignById.has(attributionForm.campaign_id)) throw new Error("Select a campaign in the active company.");
      if (!attributionForm.source_id) throw new Error("Select a lead or invoice to attribute.");
      const payload: Record<string, unknown> = {
        company_id: activeCompany.id, campaign_id: attributionForm.campaign_id,
        lead_id: attributionForm.source_type === "lead" ? attributionForm.source_id : null,
        invoice_id: attributionForm.source_type === "invoice" ? attributionForm.source_id : null,
        attribution_model: attributionForm.attribution_model, source: attributionForm.source.trim() || null,
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      };
      const { error } = await db.from("marketing_campaign_attributions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign attribution recorded.");
      setAttributionOpen(false);
      setAttributionForm({ campaign_id: "", source_type: "lead", source_id: "", attribution_model: "last_touch", source: "" });
      qc.invalidateQueries({ queryKey: ["marketing-attributions", activeCompany?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader title="Marketing & Campaigns" description={activeCompany ? `Campaign planning and ERP-attributed outcomes · ${activeCompany.display_name}` : "Plan campaigns and attribute recorded leads and invoiced sales."} actions={
        canManage ? <div className="flex flex-wrap gap-2">
          <Dialog open={attributionOpen} onOpenChange={open => { setAttributionOpen(open); if (open) setAttributionForm(s => ({ ...s, source_id: "" })); }}>
            <DialogTrigger asChild><Button variant="outline" disabled={!campaignsQuery.data?.length}><Target className="mr-2 h-4 w-4" />Attribute outcome</Button></DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Attribute an ERP outcome</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1"><Label>Campaign</Label><Select value={attributionForm.campaign_id} onValueChange={value => setAttributionForm(s => ({ ...s, campaign_id: value }))}><SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger><SelectContent>{(campaignsQuery.data ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.campaign_code} · {c.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Outcome type</Label><Select value={attributionForm.source_type} onValueChange={value => setAttributionForm(s => ({ ...s, source_type: value, source_id: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lead">Qualified lead</SelectItem><SelectItem value="invoice">Invoiced sale</SelectItem></SelectContent></Select></div>
                {attributionForm.source_type === "lead" ? <div className="space-y-1"><Label>Lead</Label><Select value={attributionForm.source_id} onValueChange={value => setAttributionForm(s => ({ ...s, source_id: value }))}><SelectTrigger><SelectValue placeholder={leadsQuery.isLoading ? "Loading leads…" : "Select lead"} /></SelectTrigger><SelectContent>{(leadsQuery.data ?? []).map(l => <SelectItem key={l.id} value={l.id}>{l.lead_number} · {l.name} ({l.status})</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-1"><Label>Invoice (revenue uses recorded invoice total)</Label><Select value={attributionForm.source_id} onValueChange={value => setAttributionForm(s => ({ ...s, source_id: value }))}><SelectTrigger><SelectValue placeholder={invoicesQuery.isLoading ? "Loading invoices…" : "Select invoice"} /></SelectTrigger><SelectContent>{(invoicesQuery.data ?? []).map(i => <SelectItem key={i.id} value={i.id}>{i.invoice_number} · {money(Number(i.total_amount))} · {day(i.invoice_date)}</SelectItem>)}</SelectContent></Select></div>}
                <div className="space-y-1"><Label>Attribution model</Label><Select value={attributionForm.attribution_model} onValueChange={value => setAttributionForm(s => ({ ...s, attribution_model: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="first_touch">First touch</SelectItem><SelectItem value="last_touch">Last touch</SelectItem><SelectItem value="assisted">Assisted</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Source / campaign reference</Label><Input value={attributionForm.source} onChange={e => setAttributionForm(s => ({ ...s, source: e.target.value }))} placeholder="e.g. UTM, dealer event, referral code" /></div>
                <Button className="min-h-11" onClick={() => addAttribution.mutate()} disabled={addAttribution.isPending}>{addAttribution.isPending ? "Saving…" : "Save attribution"}</Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Attribution links to existing lead or invoice records; it does not create a lead, invoice, external event or accounting entry.</p>
            </DialogContent>
          </Dialog>
          <Dialog open={costOpen} onOpenChange={setCostOpen}>
            <DialogTrigger asChild><Button variant="outline" disabled={!campaignsQuery.data?.length}><Receipt className="mr-2 h-4 w-4" />Record spend</Button></DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Record campaign spend</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2"><Label>Campaign</Label><Select value={costForm.campaign_id} onValueChange={value => setCostForm(s => ({ ...s, campaign_id: value }))}><SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger><SelectContent>{(campaignsQuery.data ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.campaign_code} · {c.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Spend date</Label><Input type="date" value={costForm.spend_date} onChange={e => setCostForm(s => ({ ...s, spend_date: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Amount (₹)</Label><Input type="number" min="0.01" step="0.01" value={costForm.amount} onChange={e => setCostForm(s => ({ ...s, amount: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Category</Label><Select value={costForm.category} onValueChange={value => setCostForm(s => ({ ...s, category: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="advertising">Advertising</SelectItem><SelectItem value="creative">Creative / production</SelectItem><SelectItem value="agency">Agency</SelectItem><SelectItem value="event">Event / activation</SelectItem><SelectItem value="promotion">Promotion / samples</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Vendor / platform</Label><Input value={costForm.vendor} onChange={e => setCostForm(s => ({ ...s, vendor: e.target.value }))} /></div>
                <div className="space-y-1 sm:col-span-2"><Label>Receipt / invoice reference</Label><Input value={costForm.reference} onChange={e => setCostForm(s => ({ ...s, reference: e.target.value }))} /></div>
                <Button className="sm:col-span-2 min-h-11" onClick={() => addCost.mutate()} disabled={addCost.isPending}>{addCost.isPending ? "Saving…" : "Save spend record"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New campaign</Button></DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Create marketing campaign</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Campaign code</Label><Input value={campaignForm.campaign_code} onChange={e => setCampaignForm(s => ({ ...s, campaign_code: e.target.value }))} placeholder="ZIZZ-DIWALI-26" /></div>
                <div className="space-y-1"><Label>Campaign name</Label><Input value={campaignForm.name} onChange={e => setCampaignForm(s => ({ ...s, name: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Channel</Label><Select value={campaignForm.channel} onValueChange={value => setCampaignForm(s => ({ ...s, channel: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Status</Label><Select value={campaignForm.status} onValueChange={value => setCampaignForm(s => ({ ...s, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.replaceAll("_"," ")}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Objective</Label><Select value={campaignForm.objective} onValueChange={value => setCampaignForm(s => ({ ...s, objective: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sales_growth">Sales growth</SelectItem><SelectItem value="lead_generation">Lead generation</SelectItem><SelectItem value="brand_awareness">Brand awareness</SelectItem><SelectItem value="dealer_activation">Dealer activation</SelectItem><SelectItem value="product_launch">Product launch</SelectItem><SelectItem value="retention">Customer retention</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Planned budget (₹)</Label><Input type="number" min="0" step="0.01" value={campaignForm.budget_amount} onChange={e => setCampaignForm(s => ({ ...s, budget_amount: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Start date</Label><Input type="date" value={campaignForm.start_date} onChange={e => setCampaignForm(s => ({ ...s, start_date: e.target.value }))} /></div>
                <div className="space-y-1"><Label>End date</Label><Input type="date" value={campaignForm.end_date} onChange={e => setCampaignForm(s => ({ ...s, end_date: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Lead target</Label><Input type="number" min="0" step="1" value={campaignForm.target_leads} onChange={e => setCampaignForm(s => ({ ...s, target_leads: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Conversion target</Label><Input type="number" min="0" step="1" value={campaignForm.target_conversions} onChange={e => setCampaignForm(s => ({ ...s, target_conversions: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Revenue target (₹)</Label><Input type="number" min="0" step="0.01" value={campaignForm.target_revenue} onChange={e => setCampaignForm(s => ({ ...s, target_revenue: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Landing page URL</Label><Input type="url" value={campaignForm.landing_page_url} onChange={e => setCampaignForm(s => ({ ...s, landing_page_url: e.target.value }))} placeholder="https://…" /></div>
                <div className="space-y-1"><Label>UTM source</Label><Input value={campaignForm.utm_source} onChange={e => setCampaignForm(s => ({ ...s, utm_source: e.target.value }))} /></div>
                <div className="space-y-1"><Label>UTM medium</Label><Input value={campaignForm.utm_medium} onChange={e => setCampaignForm(s => ({ ...s, utm_medium: e.target.value }))} /></div>
                <div className="space-y-1"><Label>UTM campaign</Label><Input value={campaignForm.utm_campaign} onChange={e => setCampaignForm(s => ({ ...s, utm_campaign: e.target.value }))} />
                </div>
                <Button className="sm:col-span-2 min-h-11" onClick={() => createCampaign.mutate()} disabled={createCampaign.isPending}>{createCampaign.isPending ? "Saving…" : "Create campaign"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div> : undefined
      } />
      <PageBody>
        {loadError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span>Marketing records could not be loaded. Verify your company access and retry.</span></div>}
        {loading && <div role="status" className="mb-4 rounded-lg border p-4 text-sm text-muted-foreground">Loading campaigns for {activeCompany?.display_name ?? "the active company"}…</div>}
        {!loading && !loadError && <>
          <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Marketing performance summary">
            <Metric icon={Megaphone} label="Campaigns" value={String(totals.campaigns)} detail="Recorded campaigns" />
            <Metric icon={Receipt} label="Tracked spend" value={money(totals.spend)} detail="Spend records, not ledger postings" />
            <Metric icon={Target} label="Attributed leads" value={String(totals.leads)} detail="Unique linked CRM leads" />
            <Metric icon={TrendingUp} label="Attributed invoices" value={String(totals.conversions)} detail="Unique linked invoices" />
            <Metric icon={BarChart3} label="Attributed invoiced revenue" value={money(totals.revenue)} detail="Recorded invoice totals" />
          </section>
          {(rows.length === 0) ? <Card><CardContent className="p-8 text-center"><Megaphone className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No campaigns yet</h2><p className="mt-1 text-sm text-muted-foreground">Create a campaign to start tracking budgets, spend, leads and invoiced outcomes. Third-party channel connections are not implied by creating a campaign.</p></CardContent></Card> :
            <div className="grid gap-4 xl:grid-cols-2">{rows.map(({campaign:c,spend,leadCount,conversionCount,revenue,returnOnSpend,costCount}) => (
              <Card key={c.id} className="min-w-0">
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{c.campaign_code} · {c.channel.replaceAll("_"," ")}</p><CardTitle className="mt-1 text-base">{c.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{day(c.start_date)} – {day(c.end_date)}</p></div><Badge variant={c.status === "active" ? "default" : c.status === "cancelled" ? "destructive" : "secondary"} className="capitalize">{c.status}</Badge></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Mini label="Budget" value={money(Number(c.budget_amount))} />
                    <Mini label="Tracked spend" value={money(spend)} />
                    <Mini label="Leads" value={String(leadCount)} target={c.target_leads} />
                    <Mini label="Invoices" value={String(conversionCount)} target={c.target_conversions} />
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
                    <div><p className="text-xs text-muted-foreground">Attributed revenue</p><p className="text-lg font-semibold">{money(revenue)}</p><p className="text-xs text-muted-foreground">{returnOnSpend === null ? "ROAS unavailable until spend is recorded" : `${returnOnSpend.toFixed(2)}× return on tracked spend`}</p></div>
                    <div className="text-right"><p className="text-xs text-muted-foreground">Spend records</p><p className="font-medium">{costCount}</p></div>
                  </div>
                  {c.landing_page_url && <a href={c.landing_page_url} target="_blank" rel="noreferrer" className="break-all text-xs text-primary underline">{c.landing_page_url}</a>}
                </CardContent>
              </Card>
            ))}</div>
          }
          <Card className="mt-5"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarRange className="h-4 w-4" />Attribution evidence · latest 2,000</CardTitle></CardHeader><CardContent>
            {(attributionsQuery.data ?? []).length === 0 ? <p className="py-4 text-sm text-muted-foreground">No attributed leads or invoices yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Date</th><th className="p-3">Campaign</th><th className="p-3">Source record</th><th className="p-3">Model</th><th className="p-3">Source / reference</th></tr></thead><tbody className="divide-y">{(attributionsQuery.data ?? []).map(a => { const c=campaignById.get(a.campaign_id); const lead=leadById.get(a.lead_id ?? ""); const invoice=invoiceById.get(a.invoice_id ?? ""); return <tr key={a.id}><td className="p-3 whitespace-nowrap">{day(a.attributed_at.slice(0,10))}</td><td className="p-3">{c?.name ?? "Campaign unavailable"}</td><td className="p-3">{a.lead_id ? `${lead?.lead_number ?? "Lead"} · ${lead?.name ?? "Unavailable"}` : `${invoice?.invoice_number ?? "Invoice"} · ${invoice ? money(Number(invoice.total_amount)) : "value unavailable"}`}</td><td className="p-3 capitalize">{a.attribution_model.replaceAll("_"," ")}</td><td className="p-3">{a.source ?? "—"}</td></tr>})}</tbody></table></div>}
          </CardContent></Card>
          <p className="mt-3 text-xs text-muted-foreground">Tracking currently reflects records entered in this ERP. Ad-platform impressions, clicks, cost imports, email/WhatsApp delivery and web events require provider connections and are not fabricated. Attributed revenue uses invoices linked to the active company; spend records are not yet posted to accounting.</p>
        </>}
      </PageBody>
    </>
  );
}

function Metric({icon:Icon,label,value,detail}:{icon:React.ComponentType<{className?:string}>,label:string,value:string,detail:string}) {
  return <Card><CardContent className="flex items-start gap-3 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div></CardContent></Card>;
}
function Mini({label,value,target}:{label:string,value:string,target?:number|null}) {
  return <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}{target != null ? <span className="text-xs font-normal text-muted-foreground"> / {target}</span> : null}</p></div>;
}
