-- AI-generated marketing creatives are drafts until a human approves external publication.
create table if not exists public.marketing_creatives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  title text not null,
  user_prompt text not null,
  channel text not null check (channel in ('social','whatsapp','email','website','print','direct_customer')),
  language text not null default 'English',
  audience text,
  offer text,
  creative_payload jsonb not null,
  image_path text,
  agent_trace jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_marketing_creatives_company_created
  on public.marketing_creatives(company_id, created_at desc);
create index if not exists idx_marketing_creatives_company_status
  on public.marketing_creatives(company_id, status, created_at desc);
alter table public.marketing_creatives enable row level security;
drop policy if exists marketing_creatives_select on public.marketing_creatives;
create policy marketing_creatives_select on public.marketing_creatives for select
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_creatives.company_id and a.can_view));
drop policy if exists marketing_creatives_insert on public.marketing_creatives;
create policy marketing_creatives_insert on public.marketing_creatives for insert
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and created_by = auth.uid()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_creatives.company_id and a.can_view and a.can_create));
drop policy if exists marketing_creatives_update on public.marketing_creatives;
create policy marketing_creatives_update on public.marketing_creatives for update
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_creatives.company_id and a.can_view and a.can_edit))
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_creatives.company_id and a.can_view and a.can_edit));
drop policy if exists marketing_creatives_delete on public.marketing_creatives;
create policy marketing_creatives_delete on public.marketing_creatives for delete
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = marketing_creatives.company_id and a.can_view and a.can_delete));

-- Data API access so the app can reach the table through its policies.
grant select, insert, update, delete on public.marketing_creatives to authenticated;
grant all on public.marketing_creatives to service_role;