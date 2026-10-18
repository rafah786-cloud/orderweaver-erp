-- Marketing campaign operations and evidence-based sales attribution.
-- This tracks campaign operations, not accounting postings or third-party delivery receipts.

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_code text not null,
  name text not null,
  objective text not null default 'sales_growth',
  channel text not null check (channel in ('website','email','whatsapp','social','search_ads','offline','dealer','retail','event','referral','other')),
  status text not null default 'draft' check (status in ('draft','approved','scheduled','active','paused','completed','cancelled')),
  start_date date,
  end_date date,
  budget_amount numeric(18,2) not null default 0 check (budget_amount >= 0),
  target_leads integer check (target_leads is null or target_leads >= 0),
  target_conversions integer check (target_conversions is null or target_conversions >= 0),
  target_revenue numeric(18,2) check (target_revenue is null or target_revenue >= 0),
  owner_id uuid,
  landing_page_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  audience_description text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, campaign_code),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.marketing_campaign_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete restrict,
  spend_date date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  category text not null default 'advertising',
  vendor text,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_campaign_attributions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete restrict,
  lead_id uuid references public.crm_leads(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  attribution_model text not null default 'last_touch' check (attribution_model in ('first_touch','last_touch','assisted','manual')),
  source text,
  attributed_at timestamptz not null default now(),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((lead_id is not null)::integer + (invoice_id is not null)::integer = 1)
);

create unique index if not exists uq_marketing_campaign_lead_attribution
  on public.marketing_campaign_attributions(company_id, lead_id) where lead_id is not null;
create unique index if not exists uq_marketing_invoice_attribution
  on public.marketing_campaign_attributions(company_id, invoice_id) where invoice_id is not null;
create index if not exists idx_marketing_campaigns_company_status
  on public.marketing_campaigns(company_id, status, start_date);
create index if not exists idx_marketing_costs_company_campaign_date
  on public.marketing_campaign_costs(company_id, campaign_id, spend_date desc);
create index if not exists idx_marketing_attribution_company_campaign
  on public.marketing_campaign_attributions(company_id, campaign_id, attributed_at desc);

create or replace function public.guard_marketing_company_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.marketing_campaigns c
    where c.id = new.campaign_id and c.company_id = new.company_id
  ) then
    raise exception 'Campaign is not in the selected company';
  end if;

  if tg_table_name = 'marketing_campaign_attributions' then
    if new.lead_id is not null and not exists (
      select 1 from public.crm_leads l
      where l.id = new.lead_id and l.company_id = new.company_id
    ) then
      raise exception 'Lead is not in the selected company';
    end if;
    if new.invoice_id is not null and not exists (
      select 1 from public.invoices i
      where i.id = new.invoice_id and i.company_id = new.company_id
    ) then
      raise exception 'Invoice is not in the selected company';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_cost_company_guard on public.marketing_campaign_costs;
create trigger marketing_cost_company_guard
before insert or update of company_id, campaign_id on public.marketing_campaign_costs
for each row execute function public.guard_marketing_company_links();

drop trigger if exists marketing_attribution_company_guard on public.marketing_campaign_attributions;
create trigger marketing_attribution_company_guard
before insert or update of company_id, campaign_id, lead_id, invoice_id on public.marketing_campaign_attributions
for each row execute function public.guard_marketing_company_links();

alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_costs enable row level security;
alter table public.marketing_campaign_attributions enable row level security;

drop policy if exists marketing_campaigns_select on public.marketing_campaigns;
create policy marketing_campaigns_select on public.marketing_campaigns for select
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaigns.company_id and a.can_view));
drop policy if exists marketing_campaigns_insert on public.marketing_campaigns;
create policy marketing_campaigns_insert on public.marketing_campaigns for insert
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaigns.company_id and a.can_view and a.can_create));
drop policy if exists marketing_campaigns_update on public.marketing_campaigns;
create policy marketing_campaigns_update on public.marketing_campaigns for update
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaigns.company_id and a.can_view and a.can_edit))
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaigns.company_id and a.can_view and a.can_edit));
drop policy if exists marketing_campaigns_delete on public.marketing_campaigns;
create policy marketing_campaigns_delete on public.marketing_campaigns for delete
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaigns.company_id and a.can_view and a.can_delete));

drop policy if exists marketing_costs_select on public.marketing_campaign_costs;
create policy marketing_costs_select on public.marketing_campaign_costs for select
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaign_costs.company_id and a.can_view));
drop policy if exists marketing_costs_insert on public.marketing_campaign_costs;
create policy marketing_costs_insert on public.marketing_campaign_costs for insert
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaign_costs.company_id and a.can_view and a.can_create));
drop policy if exists marketing_costs_update on public.marketing_campaign_costs;
create policy marketing_costs_update on public.marketing_campaign_costs for update
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaign_costs.company_id and a.can_view and a.can_edit))
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaign_costs.company_id and a.can_view and a.can_edit));

drop policy if exists marketing_attributions_select on public.marketing_campaign_attributions;
create policy marketing_attributions_select on public.marketing_campaign_attributions for select
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaign_attributions.company_id and a.can_view));
drop policy if exists marketing_attributions_insert on public.marketing_campaign_attributions;
create policy marketing_attributions_insert on public.marketing_campaign_attributions for insert
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_campaign_attributions.company_id and a.can_view and a.can_create));

-- Costs and attribution are evidence records. Finance expense posting is a separate approved workflow.
revoke update, delete on public.marketing_campaign_attributions from anon, authenticated;
grant select, insert on public.marketing_campaign_attributions to authenticated;
