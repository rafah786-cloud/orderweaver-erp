-- Harden maintenance/asset data integrity without rewriting historical records.
-- Stage this migration and validate against a recoverable database copy before production.

create unique index if not exists maintenance_assets_company_id_id_uidx
  on public.maintenance_assets(company_id, id);
create unique index if not exists maintenance_plans_company_id_id_uidx
  on public.maintenance_plans(company_id, id);
create unique index if not exists maintenance_work_orders_company_id_id_uidx
  on public.maintenance_work_orders(company_id, id);
create unique index if not exists work_centers_company_id_id_uidx
  on public.work_centers(company_id, id);
create unique index if not exists stock_items_company_id_id_uidx
  on public.stock_items(company_id, id);

do $migration$
begin
  if not exists (select 1 from pg_constraint where conname = 'maintenance_plans_company_asset_fk') then
    alter table public.maintenance_plans
      add constraint maintenance_plans_company_asset_fk
      foreign key (company_id, asset_id)
      references public.maintenance_assets(company_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_work_orders_company_asset_fk') then
    alter table public.maintenance_work_orders
      add constraint maintenance_work_orders_company_asset_fk
      foreign key (company_id, asset_id)
      references public.maintenance_assets(company_id, id)
      on delete restrict not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_work_orders_company_plan_fk') then
    alter table public.maintenance_work_orders
      add constraint maintenance_work_orders_company_plan_fk
      foreign key (company_id, maintenance_plan_id)
      references public.maintenance_plans(company_id, id)
      on delete restrict not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_assets_company_work_center_fk') then
    alter table public.maintenance_assets
      add constraint maintenance_assets_company_work_center_fk
      foreign key (company_id, work_center_id)
      references public.work_centers(company_id, id)
      on delete restrict not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_meter_readings_company_asset_fk') then
    alter table public.maintenance_meter_readings
      add constraint maintenance_meter_readings_company_asset_fk
      foreign key (company_id, asset_id)
      references public.maintenance_assets(company_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_spares_company_work_order_fk') then
    alter table public.maintenance_spares
      add constraint maintenance_spares_company_work_order_fk
      foreign key (company_id, work_order_id)
      references public.maintenance_work_orders(company_id, id)
      on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_spares_company_stock_item_fk') then
    alter table public.maintenance_spares
      add constraint maintenance_spares_company_stock_item_fk
      foreign key (company_id, stock_item_id)
      references public.stock_items(company_id, id)
      on delete restrict not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_assets_nonnegative_cost_ck') then
    alter table public.maintenance_assets
      add constraint maintenance_assets_nonnegative_cost_ck
      check (acquisition_cost >= 0 and (useful_life_months is null or useful_life_months > 0))
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_plans_positive_frequency_ck') then
    alter table public.maintenance_plans
      add constraint maintenance_plans_positive_frequency_ck
      check (
        frequency_value is null or frequency_value > 0
      )
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'maintenance_work_orders_nonnegative_costs_ck') then
    alter table public.maintenance_work_orders
      add constraint maintenance_work_orders_nonnegative_costs_ck
      check (
        downtime_minutes >= 0
        and labor_cost >= 0
        and parts_cost >= 0
        and other_cost >= 0
      )
      not valid;
  end if;
end
$migration$;

create or replace function public.enforce_maintenance_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'completed'
    and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    if nullif(btrim(new.resolution), '') is null then
      raise exception 'Maintenance work order completion requires a documented resolution';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$function$;

revoke all on function public.enforce_maintenance_completion() from public, anon, authenticated;
drop trigger if exists maintenance_work_order_completion_guard on public.maintenance_work_orders;
create trigger maintenance_work_order_completion_guard
before insert or update of status on public.maintenance_work_orders
for each row execute function public.enforce_maintenance_completion();

-- Calendar and meter-based plans require a usable interval; condition-based plans
-- may use a null interval because the trigger is driven by condition events.
create or replace function public.enforce_maintenance_plan_frequency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.active and new.frequency_type in ('calendar', 'meter') then
    if new.frequency_value is null or new.frequency_value <= 0
      or nullif(btrim(new.frequency_unit), '') is null then
      raise exception 'Active calendar/meter maintenance plans require a positive frequency and unit';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.enforce_maintenance_plan_frequency() from public, anon, authenticated;
drop trigger if exists maintenance_plan_frequency_guard on public.maintenance_plans;
create trigger maintenance_plan_frequency_guard
before insert or update of active, frequency_type, frequency_value, frequency_unit
on public.maintenance_plans
for each row execute function public.enforce_maintenance_plan_frequency();
