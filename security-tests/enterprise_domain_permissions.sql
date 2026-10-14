-- Run after 20261014143000_harden_enterprise_domain_permissions.sql.
-- Verify the additive-domain CRUD contract without asserting over legacy finance policy.

do $test$
declare
  v_remaining_broad integer;
  v_missing_policy integer;
  v_audit_writes integer;
  v_domain_tables text[] := array[
    'ai_data_freshness','backup_verification_runs',
    'bom_revision_lines','bom_revisions',
    'data_quality_issues','engineering_change_order_lines','engineering_change_orders',
    'erp_domain_audit_log','integration_health','integration_runs',
    'maintenance_assets','maintenance_meter_readings','maintenance_plans','maintenance_spares',
    'maintenance_work_orders','master_data_quality_rules','mps_lines','mps_plans',
    'mrp_exceptions','mrp_planned_orders','mrp_runs','production_operations','project_tasks','projects',
    'quality_capa_actions','quality_inspections','quality_nonconformances','quality_plans','quality_results',
    'rfq_lines','rfqs','routing_operation_dependencies','routing_operations','routings',
    'sales_return_lines','sales_returns','shipment_lines','stock_count_lines','stock_counts',
    'supplier_quote_lines','supplier_quotes','supplier_scorecards','three_way_match_results',
    'warehouse_bins','warehouse_zones','work_center_calendars','work_centers',
    'workflow_definitions','workflow_instances','workflow_tasks'
  ];
begin
  select count(*) into v_remaining_broad
  from pg_policies
  where schemaname='public'
    and policyname like 'company_scope%'
    and tablename = any(v_domain_tables);

  if v_remaining_broad > 0 then
    raise exception 'Broad company_scope policies remain on % additive-domain table(s)', v_remaining_broad;
  end if;

  select count(*) into v_missing_policy
  from unnest(v_domain_tables) as target(tablename)
  where exists (select 1 from information_schema.tables i where i.table_schema='public' and i.table_name=target.tablename)
    and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=target.tablename and p.policyname='company_permission_select')
    and exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=target.tablename);

  if v_missing_policy > 0 then
    raise exception 'Permission policy coverage is incomplete for % additive-domain table(s)', v_missing_policy;
  end if;

  select count(*) into v_missing_policy
  from unnest(v_domain_tables) as target(tablename)
  where target.tablename <> all (array['ai_data_freshness','backup_verification_runs','erp_domain_audit_log','integration_health','integration_runs','mrp_runs','workflow_definitions','workflow_instances','workflow_tasks']::text[])
    and exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=target.tablename)
    and (
      not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=target.tablename and p.policyname='company_permission_insert' and p.with_check like '%can_create%')
      or not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=target.tablename and p.policyname='company_permission_update' and p.qual like '%can_edit%' and p.with_check like '%can_edit%')
      or not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=target.tablename and p.policyname='company_permission_delete' and p.qual like '%can_delete%')
    );

  if v_missing_policy > 0 then
    raise exception 'CRUD permission policy coverage is incomplete for % additive-domain table(s)', v_missing_policy;
  end if;

  select count(*) into v_audit_writes
  from pg_policies
  where schemaname='public'
    and tablename = any (array['ai_data_freshness','backup_verification_runs','erp_domain_audit_log','integration_health','integration_runs','mrp_runs','workflow_definitions','workflow_instances','workflow_tasks']::text[])
    and cmd in ('INSERT','UPDATE','DELETE','ALL');

  if v_audit_writes > 0 then
    raise exception 'A system-managed read-only table has a client write policy';
  end if;
end
$test$;

-- Direct-call privileges: audit is trigger-only; sales-order creation is authenticated-only.
do $privilege_test$
begin
  if has_function_privilege('anon', 'public.audit_enterprise_domain_change()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.audit_enterprise_domain_change()', 'EXECUTE') then
    raise exception 'Trigger-only audit function must not be directly executable by client roles';
  end if;

  if has_function_privilege('anon', 'public.create_sales_order_atomic(uuid,date,date,text,text,jsonb)', 'EXECUTE') then
    raise exception 'Anonymous callers must not execute the sales-order creation RPC';
  end if;

  if not has_function_privilege('authenticated', 'public.create_sales_order_atomic(uuid,date,date,text,text,jsonb)', 'EXECUTE') then
    raise exception 'Authenticated callers must retain the guarded sales-order creation RPC';
  end if;
end
$privilege_test$;
