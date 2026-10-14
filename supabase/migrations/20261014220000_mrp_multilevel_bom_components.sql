-- Additive, staged support for explicit subassembly lines in governed BOM revisions.
-- Do not apply to production until the application PR is reviewed and the normal release gate is approved.
-- Existing rows are not rewritten; legacy rows are checked by the MRP preview and surfaced as blockers.

alter table public.bom_revision_lines
  add column if not exists component_model_id uuid;

-- Composite unique indexes are required for same-company foreign keys.
create unique index if not exists product_models_company_id_id_uidx
  on public.product_models(company_id, id);
create unique index if not exists bom_revisions_company_id_id_uidx
  on public.bom_revisions(company_id, id);
create unique index if not exists raw_materials_company_id_id_uidx
  on public.raw_materials(company_id, id);
create unique index if not exists stock_items_company_id_id_uidx
  on public.stock_items(company_id, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bom_revision_lines_company_parent_fk') then
    alter table public.bom_revision_lines
      add constraint bom_revision_lines_company_parent_fk
      foreign key (company_id, bom_revision_id)
      references public.bom_revisions(company_id, id)
      on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bom_revision_lines_company_raw_material_fk') then
    alter table public.bom_revision_lines
      add constraint bom_revision_lines_company_raw_material_fk
      foreign key (company_id, raw_material_id)
      references public.raw_materials(company_id, id)
      on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bom_revision_lines_company_stock_item_fk') then
    alter table public.bom_revision_lines
      add constraint bom_revision_lines_company_stock_item_fk
      foreign key (company_id, stock_item_id)
      references public.stock_items(company_id, id)
      on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bom_revision_lines_company_component_model_fk') then
    alter table public.bom_revision_lines
      add constraint bom_revision_lines_company_component_model_fk
      foreign key (company_id, component_model_id)
      references public.product_models(company_id, id)
      on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bom_revision_lines_exactly_one_component_ck') then
    alter table public.bom_revision_lines
      add constraint bom_revision_lines_exactly_one_component_ck
      check (num_nonnulls(raw_material_id, stock_item_id, component_model_id) = 1)
      not valid;
  end if;
end $$;

create index if not exists bom_revision_lines_company_component_model_idx
  on public.bom_revision_lines(company_id, component_model_id)
  where component_model_id is not null;
