-- Maintenance work-order completion requires a documented resolution and valid downtime/costs.
-- Additive guard: no existing work-order records are rewritten.
create or replace function public.guard_maintenance_work_order_completion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'completed' and new.status <> 'completed' then
    raise exception 'Completed maintenance work orders cannot be reopened or cancelled; create a follow-up work order instead'
      using errcode = '23514';
  end if;
  if new.status = 'completed' then
    if length(btrim(coalesce(new.resolution, ''))) < 10 then
      raise exception 'Maintenance completion requires a resolution of at least 10 characters'
        using errcode = '23514';
    end if;
    if new.downtime_minutes < 0 or new.labor_cost < 0 or new.parts_cost < 0 or new.other_cost < 0 then
      raise exception 'Maintenance downtime and costs must be non-negative'
        using errcode = '23514';
    end if;
    if new.completed_at is null then new.completed_at := now(); end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_work_order_completion_guard on public.maintenance_work_orders;
create trigger maintenance_work_order_completion_guard
before insert or update of status, resolution, downtime_minutes, labor_cost, parts_cost, other_cost, completed_at
on public.maintenance_work_orders
for each row execute function public.guard_maintenance_work_order_completion();
