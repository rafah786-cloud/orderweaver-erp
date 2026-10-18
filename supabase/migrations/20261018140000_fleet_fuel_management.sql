-- Fleet and fuel management: additive company-scoped operational records.
-- Fuel logs are append-only to preserve the audit trail; they do not post accounting entries.

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_code text not null,
  registration_number text not null,
  vehicle_type text not null check (vehicle_type in ('truck','van','car','three_wheeler','two_wheeler','other')),
  make_model text,
  fuel_type text not null default 'diesel' check (fuel_type in ('diesel','petrol','cng','electric','hybrid','other')),
  assigned_driver_id uuid,
  current_odometer_km numeric(14,2) not null default 0 check (current_odometer_km >= 0),
  status text not null default 'active' check (status in ('active','maintenance','inactive','retired')),
  insurance_expiry date,
  permit_expiry date,
  fitness_expiry date,
  pollution_expiry date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, vehicle_code),
  unique(company_id, registration_number)
);

create table if not exists public.fleet_fuel_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete restrict,
  refuelled_at timestamptz not null default now(),
  odometer_km numeric(14,2) not null check (odometer_km >= 0),
  litres numeric(14,3) not null check (litres > 0),
  unit_price numeric(14,4) not null check (unit_price >= 0),
  total_amount numeric(14,2) generated always as (round(litres * unit_price, 2)) stored,
  fuel_station text,
  receipt_reference text,
  payment_method text not null default 'company_card' check (payment_method in ('cash','company_card','fuel_card','upi','other')),
  driver_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(company_id, receipt_reference),
  check (receipt_reference is null or length(trim(receipt_reference)) > 0)
);

create index if not exists idx_fleet_vehicles_company_status on public.fleet_vehicles(company_id, status);
create index if not exists idx_fleet_fuel_company_vehicle_time on public.fleet_fuel_logs(company_id, vehicle_id, refuelled_at desc);
create index if not exists idx_fleet_fuel_company_time on public.fleet_fuel_logs(company_id, refuelled_at desc);

create or replace function public.advance_fleet_odometer_from_fuel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric(14,2);
begin
  select current_odometer_km into v_current
  from public.fleet_vehicles
  where id = new.vehicle_id and company_id = new.company_id
  for update;
  if not found then
    raise exception 'Vehicle not found in the selected company';
  end if;
  if new.odometer_km < v_current then
    raise exception 'Fuel odometer cannot be lower than the recorded vehicle odometer';
  end if;
  update public.fleet_vehicles
    set current_odometer_km = new.odometer_km, updated_at = now()
    where id = new.vehicle_id and company_id = new.company_id;
  return new;
end;
$$;

drop trigger if exists fleet_fuel_advances_odometer on public.fleet_fuel_logs;
create trigger fleet_fuel_advances_odometer
before insert on public.fleet_fuel_logs
for each row execute function public.advance_fleet_odometer_from_fuel();

alter table public.fleet_vehicles enable row level security;
alter table public.fleet_fuel_logs enable row level security;

drop policy if exists fleet_vehicles_select on public.fleet_vehicles;
create policy fleet_vehicles_select on public.fleet_vehicles for select
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = fleet_vehicles.company_id and a.can_view));

drop policy if exists fleet_vehicles_insert on public.fleet_vehicles;
create policy fleet_vehicles_insert on public.fleet_vehicles for insert
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = fleet_vehicles.company_id and a.can_view and a.can_create));

drop policy if exists fleet_vehicles_update on public.fleet_vehicles;
create policy fleet_vehicles_update on public.fleet_vehicles for update
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = fleet_vehicles.company_id and a.can_view and a.can_edit))
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = fleet_vehicles.company_id and a.can_view and a.can_edit));

drop policy if exists fleet_vehicles_delete on public.fleet_vehicles;
create policy fleet_vehicles_delete on public.fleet_vehicles for delete
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = fleet_vehicles.company_id and a.can_view and a.can_delete));

drop policy if exists fleet_fuel_logs_select on public.fleet_fuel_logs;
create policy fleet_fuel_logs_select on public.fleet_fuel_logs for select
using (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = fleet_fuel_logs.company_id and a.can_view));

drop policy if exists fleet_fuel_logs_insert on public.fleet_fuel_logs;
create policy fleet_fuel_logs_insert on public.fleet_fuel_logs for insert
with check (public.is_approved(auth.uid()) and company_id = public.current_company_id()
  and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = fleet_fuel_logs.company_id and a.can_view and a.can_create)
  and exists (select 1 from public.fleet_vehicles v where v.id = fleet_fuel_logs.vehicle_id and v.company_id = fleet_fuel_logs.company_id));

-- Fuel events are evidence, not editable working documents.
revoke update, delete on public.fleet_fuel_logs from anon, authenticated;
grant select, insert on public.fleet_fuel_logs to authenticated;
