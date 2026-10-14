-- Tighten quality workflow invariants without rewriting historical inspection data.
-- Staged migration only: validate against a recoverable database copy before production use.

do $migration$
begin
  if not exists (select 1 from pg_constraint where conname = 'quality_inspections_nonnegative_quantities_ck') then
    alter table public.quality_inspections
      add constraint quality_inspections_nonnegative_quantities_ck
      check (
        quantity_inspected >= 0
        and quantity_accepted >= 0
        and quantity_rejected >= 0
        and quantity_accepted + quantity_rejected <= quantity_inspected
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'quality_results_valid_limits_ck') then
    alter table public.quality_results
      add constraint quality_results_valid_limits_ck
      check (
        lower_limit is null
        or upper_limit is null
        or lower_limit <= upper_limit
      ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'quality_capa_done_requires_effectiveness_ck') then
    alter table public.quality_capa_actions
      add constraint quality_capa_done_requires_effectiveness_ck
      check (
        status <> 'done'
        or nullif(btrim(effectiveness_result), '') is not null
      ) not valid;
  end if;
end
$migration$;

create or replace function public.enforce_quality_nonconformance_closure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'closed' and (tg_op = 'INSERT' or old.status is distinct from 'closed') then
    if new.disposition is null
      or nullif(btrim(new.root_cause), '') is null
      or nullif(btrim(new.containment_action), '') is null then
      raise exception 'Quality nonconformance closure requires disposition, root cause and containment action';
    end if;

    if exists (
      select 1
      from public.quality_capa_actions action
      where action.company_id = new.company_id
        and action.nc_id = new.id
        and action.status not in ('done', 'cancelled')
    ) then
      raise exception 'Quality nonconformance closure blocked while CAPA actions remain open';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists quality_nonconformance_closure_guard on public.quality_nonconformances;
create trigger quality_nonconformance_closure_guard
before insert or update of status on public.quality_nonconformances
for each row execute function public.enforce_quality_nonconformance_closure();

revoke all on function public.enforce_quality_nonconformance_closure() from public, anon, authenticated;
