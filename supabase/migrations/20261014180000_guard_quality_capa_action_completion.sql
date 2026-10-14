-- CAPA action completion requires a recorded effectiveness result.
-- This guard is additive and does not modify existing quality records.
create or replace function public.guard_quality_capa_action_completion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'done' and new.status <> 'done' then
    raise exception 'Completed CAPA actions cannot be reopened or cancelled; create a follow-up action instead'
      using errcode = '23514';
  end if;
  if new.status = 'done' then
    if length(btrim(coalesce(new.effectiveness_result, ''))) < 10 then
      raise exception 'CAPA action completion requires an effectiveness result of at least 10 characters'
        using errcode = '23514';
    end if;
    if new.completed_at is null then
      new.completed_at := now();
    end if;
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists quality_capa_action_completion_guard on public.quality_capa_actions;
create trigger quality_capa_action_completion_guard
before insert or update of status, effectiveness_result, completed_at
on public.quality_capa_actions
for each row execute function public.guard_quality_capa_action_completion();
