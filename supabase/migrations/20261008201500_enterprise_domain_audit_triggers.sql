-- Enterprise domain audit triggers.
-- Every workbench mutation is captured in the same database transaction as the
-- business change, so an audit failure cannot leave an un-audited mutation.

create or replace function public.audit_enterprise_domain_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_entity_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if TG_OP = 'DELETE' then
    v_company_id := OLD.company_id;
    v_entity_id := OLD.id;
    v_before := to_jsonb(OLD);
    v_after := null;
  elsif TG_OP = 'INSERT' then
    v_company_id := NEW.company_id;
    v_entity_id := NEW.id;
    v_before := null;
    v_after := to_jsonb(NEW);
  else
    v_company_id := NEW.company_id;
    v_entity_id := NEW.id;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
  end if;

  insert into public.erp_domain_audit_log(
    company_id, module, entity_type, entity_id, action, before_data, after_data, actor_id
  ) values (
    v_company_id, 'enterprise_domain', TG_TABLE_NAME, v_entity_id, lower(TG_OP), v_before, v_after, auth.uid()
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'work_centers','mps_plans','mps_lines','routings','routing_operations','routing_operation_dependencies',
    'mrp_runs','mrp_planned_orders','mrp_exceptions','production_operations',
    'quality_plans','quality_inspections','quality_results','quality_nonconformances','quality_capa_actions',
    'maintenance_assets','maintenance_plans','maintenance_work_orders','maintenance_meter_readings','maintenance_spares',
    'bom_revisions','bom_revision_lines','engineering_change_orders','engineering_change_order_lines',
    'rfqs','rfq_lines','supplier_quotes','supplier_quote_lines','supplier_scorecards','purchase_receipts','purchase_receipt_lines','three_way_match_results',
    'warehouse_zones','warehouse_bins','stock_counts','stock_count_lines','landed_cost_vouchers','landed_cost_allocations',
    'budgets','budget_lines','bank_reconciliations','bank_reconciliation_items','fixed_assets','fixed_asset_depreciation',
    'crm_leads','crm_opportunities','crm_activities','shipments','shipment_lines','sales_returns','sales_return_lines',
    'projects','project_tasks','workflow_definitions','workflow_instances','workflow_tasks','data_quality_issues','ai_data_freshness'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%I_domain_audit on public.%I', t, t);
    execute format(
      'create trigger trg_%I_domain_audit after insert or update or delete on public.%I for each row execute function public.audit_enterprise_domain_change()',
      t, t
    );
  end loop;
end $$;

revoke all on function public.audit_enterprise_domain_change() from public;
grant execute on function public.audit_enterprise_domain_change() to authenticated;
