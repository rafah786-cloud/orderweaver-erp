-- Staged PLM governance. Depends on 20261008120000_global_erp_capability_foundation.sql.
-- Additive only: does not rewrite BOMs, ECOs, production orders, or stock movements.
-- Do not apply until the documented production database/recovery gate is approved.

create unique index if not exists engineering_change_orders_company_id_id_uidx
  on public.engineering_change_orders(company_id, id);
create unique index if not exists bom_revisions_company_id_id_uidx
  on public.bom_revisions(company_id, id);

alter table public.bom_revisions
  add column if not exists engineering_change_order_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bom_revisions_company_eco_fk') then
    alter table public.bom_revisions
      add constraint bom_revisions_company_eco_fk
      foreign key (company_id, engineering_change_order_id)
      references public.engineering_change_orders(company_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eco_lines_company_parent_fk') then
    alter table public.engineering_change_order_lines
      add constraint eco_lines_company_parent_fk
      foreign key (company_id, eco_id)
      references public.engineering_change_orders(company_id, id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bom_revision_lines_company_parent_fk') then
    alter table public.bom_revision_lines
      add constraint bom_revision_lines_company_parent_fk
      foreign key (company_id, bom_revision_id)
      references public.bom_revisions(company_id, id)
      on delete cascade;
  end if;
end $$;

create index if not exists engineering_change_order_lines_parent_idx
  on public.engineering_change_order_lines(company_id, eco_id);
create index if not exists bom_revision_lines_parent_idx
  on public.bom_revision_lines(company_id, bom_revision_id);

create or replace function public.guard_engineering_change_order_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_line_count integer;
  v_unreasoned_count integer;
begin
  if tg_op = 'UPDATE' and old.status in ('released', 'rejected', 'cancelled') then
    if new is distinct from old then
      raise exception 'Terminal ECOs are immutable; create a follow-up ECO'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' then
    if new.status not in ('approved', 'released', 'cancelled')
       or (to_jsonb(new) - array['status','released_at']) is distinct from (to_jsonb(old) - array['status','released_at']) then
      raise exception 'Approved ECO content is frozen; create a follow-up ECO for changes'
        using errcode = '23514';
    end if;
  end if;

  if new.status in ('review', 'approved', 'released') then
    select count(*), count(*) filter (where length(btrim(coalesce(reason, ''))) = 0)
      into v_line_count, v_unreasoned_count
      from public.engineering_change_order_lines
      where company_id = new.company_id and eco_id = new.id;
    if v_line_count < 1 or v_unreasoned_count > 0 then
      raise exception 'ECO workflow requires at least one change line and a reason on every line'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if tg_op <> 'UPDATE' or old.status <> 'review' then
      raise exception 'ECO approval requires review status'
        using errcode = '23514';
    end if;
    if new.requested_by is null or new.approved_by is null or new.requested_by = new.approved_by then
      raise exception 'ECO approval requires an independent approver'
        using errcode = '23514';
    end if;
    if new.effective_from is null then
      raise exception 'ECO approval requires an effective date'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'released' then
    if tg_op <> 'UPDATE' or old.status <> 'approved' then
      raise exception 'ECO release requires approved status'
        using errcode = '23514';
    end if;
    if new.requested_by is null or new.approved_by is null or new.requested_by = new.approved_by
       or new.effective_from is null or new.effective_from > current_date then
      raise exception 'ECO release requires independent approval and an effective date that has arrived'
        using errcode = '23514';
    end if;
    if new.released_at is null then new.released_at := now(); end if;
  else
    new.released_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists engineering_change_order_lifecycle_guard on public.engineering_change_orders;
create trigger engineering_change_order_lifecycle_guard
before insert or update on public.engineering_change_orders
for each row execute function public.guard_engineering_change_order_lifecycle();

create or replace function public.guard_engineering_change_order_line()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_status text;
begin
  if tg_op = 'UPDATE' and (old.eco_id is distinct from new.eco_id or old.company_id is distinct from new.company_id) then
    select status into v_status from public.engineering_change_orders
      where id = old.eco_id and company_id = old.company_id for update;
    if v_status is null or v_status not in ('draft', 'review') then
      raise exception 'Change lines cannot be moved out of an approved or terminal ECO'
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    select status into v_status from public.engineering_change_orders
      where id = old.eco_id and company_id = old.company_id for update;
  else
    v_company_id := new.company_id;
    select status into v_status from public.engineering_change_orders
      where id = new.eco_id and company_id = new.company_id for update;
  end if;
  if v_status is null then
    raise exception 'ECO line must reference an existing ECO in the same company'
      using errcode = '23503';
  end if;
  if v_status not in ('draft', 'review') then
    raise exception 'ECO change lines are frozen after review; return to draft through a governed workflow or create a follow-up ECO'
      using errcode = '23514';
  end if;
  if tg_op <> 'DELETE' and length(btrim(coalesce(new.reason, ''))) = 0 then
    raise exception 'Every ECO change line requires a reason'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists engineering_change_order_line_guard on public.engineering_change_order_lines;
create trigger engineering_change_order_line_guard
before insert or update or delete on public.engineering_change_order_lines
for each row execute function public.guard_engineering_change_order_line();

create or replace function public.guard_bom_revision_eco_release()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_eco public.engineering_change_orders%rowtype;
  v_has_change_line boolean;
  v_has_successor boolean;
begin
  if tg_op = 'UPDATE' and old.status in ('released', 'obsolete') then
    if old.status = 'released' and new.status = 'obsolete'
       and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
      select exists (
        select 1 from public.bom_revisions successor
        where successor.company_id = old.company_id
          and successor.model_id = old.model_id
          and successor.id <> old.id
          and successor.status = 'released'
          and successor.effective_from is not null
          and successor.effective_from <= current_date
          and (successor.effective_to is null or successor.effective_to >= current_date)
      ) into v_has_successor;
      if not v_has_successor then
        raise exception 'A BOM revision cannot be obsoleted without an effective released successor'
          using errcode = '23514';
      end if;
      return new;
    end if;
    if new is distinct from old then
      raise exception 'Released BOM revision content is immutable'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if tg_op <> 'UPDATE' or old.status <> 'review'
       or new.approved_by is null or new.approved_at is null then
      raise exception 'BOM revision approval requires review status, approver and approval timestamp'
        using errcode = '23514';
    end if;
    if new.created_by is not null and new.created_by = new.approved_by then
      raise exception 'BOM revision author cannot approve their own revision'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'released' then
    if tg_op <> 'UPDATE' or old.status <> 'approved' then
      raise exception 'BOM release requires approved status'
        using errcode = '23514';
    end if;
    if new.effective_from is null or new.effective_from > current_date
       or (new.effective_to is not null and new.effective_to < new.effective_from) then
      raise exception 'BOM release requires a valid effective window that has started'
        using errcode = '23514';
    end if;
    if new.engineering_change_order_id is null then
      raise exception 'BOM release requires a linked released ECO'
        using errcode = '23514';
    end if;
    select * into v_eco from public.engineering_change_orders eco
      where eco.id = new.engineering_change_order_id and eco.company_id = new.company_id
      for key share;
    if not found or v_eco.status <> 'released' or v_eco.released_at is null
       or v_eco.approved_by is null or v_eco.requested_by is null
       or v_eco.approved_by = v_eco.requested_by
       or v_eco.effective_from is distinct from new.effective_from then
      raise exception 'Linked ECO must be released, independently approved, same-company and effective on the BOM start date'
        using errcode = '23514';
    end if;
    select exists (
      select 1 from public.engineering_change_order_lines line
      where line.company_id = new.company_id
        and line.eco_id = v_eco.id
        and line.entity_type = 'bom_revision'
        and line.entity_id = new.id
        and line.change_type in ('add', 'modify', 'replace')
        and length(btrim(coalesce(line.reason, ''))) > 0
    ) into v_has_change_line;
    if not v_has_change_line then
      raise exception 'Linked ECO must include a reasoned change line for this BOM revision'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bom_revision_eco_release_guard on public.bom_revisions;
create trigger bom_revision_eco_release_guard
before insert or update on public.bom_revisions
for each row execute function public.guard_bom_revision_eco_release();

create or replace function public.guard_released_bom_revision_line()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_company_id uuid;
  v_revision_id uuid;
begin
  if tg_op = 'UPDATE' and (old.bom_revision_id is distinct from new.bom_revision_id or old.company_id is distinct from new.company_id) then
    select status into v_status from public.bom_revisions
      where id = old.bom_revision_id and company_id = old.company_id for update;
    if v_status in ('released', 'obsolete') then
      raise exception 'BOM revision lines cannot be moved out of a released revision'
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_revision_id := old.bom_revision_id;
  else
    v_company_id := new.company_id;
    v_revision_id := new.bom_revision_id;
  end if;
  select status into v_status from public.bom_revisions
    where id = v_revision_id and company_id = v_company_id for update;
  if v_status is null then
    raise exception 'BOM revision line must reference a revision in the same company'
      using errcode = '23503';
  end if;
  if v_status in ('released', 'obsolete') then
    raise exception 'Released BOM revision lines are immutable'
      using errcode = '23514';
  end if;
  if tg_op <> 'DELETE' and (new.raw_material_id is null) = (new.stock_item_id is null) then
    raise exception 'BOM revision line must reference exactly one raw material or stock item'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists bom_revision_line_release_guard on public.bom_revision_lines;
create trigger bom_revision_line_release_guard
before insert or update or delete on public.bom_revision_lines
for each row execute function public.guard_released_bom_revision_line();
