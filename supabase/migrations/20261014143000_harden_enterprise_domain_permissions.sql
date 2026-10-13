-- Harden the additive enterprise capability tables.
-- Earlier company_scope policies checked only can_view (via has_company_access),
-- allowing view-only users to mutate operational records.
-- Map CRUD to per-company access flags and make the audit log append-only for clients.

do $migration$
declare
  p record;
  affected_tables text[];
  v_table text;
begin
  -- Restrict this migration to the additive enterprise domains. Do not rewrite
  -- legacy accounting, voucher, party, invoice or canonical stock ledger policies.
  select array_agg(distinct p.tablename order by p.tablename)
    into affected_tables
  from pg_policies p
  where p.schemaname = 'public'
    and p.policyname like 'company_scope%'
    and p.tablename = any (array[
      'ai_data_freshness','backup_verification_runs','bank_reconciliations','budgets',
      'bom_revision_lines','bom_revisions','crm_activities','crm_leads','crm_opportunities',
      'data_quality_issues','engineering_change_order_lines','engineering_change_orders',
      'erp_domain_audit_log','fixed_assets','integration_health','integration_runs',
      'maintenance_assets','maintenance_meter_readings','maintenance_plans','maintenance_spares',
      'maintenance_work_orders','master_data_quality_rules','mps_lines','mps_plans',
      'mrp_exceptions','mrp_planned_orders','mrp_runs','production_operations','project_tasks','projects',
      'quality_capa_actions','quality_inspections','quality_nonconformances','quality_plans','quality_results',
      'rfq_lines','rfqs','routing_operation_dependencies','routing_operations','routings',
      'sales_return_lines','sales_returns','shipment_lines','stock_count_lines','stock_counts',
      'supplier_quote_lines','supplier_quotes','supplier_scorecards','three_way_match_results',
      'warehouse_bins','warehouse_zones','work_center_calendars','work_centers',
      'workflow_definitions','workflow_instances','workflow_tasks'
    ]::text[])
    and exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = p.tablename
        and c.column_name = 'company_id'
    );

  foreach v_table in array coalesce(affected_tables, array[]::text[])
  loop
    -- PostgreSQL ORs permissive policies together, so remove every old broad policy.
    for p in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname like 'company_scope%'
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, v_table);
    end loop;

    execute format('drop policy if exists company_permission_select on public.%I', v_table);
    execute format('drop policy if exists company_permission_insert on public.%I', v_table);
    execute format('drop policy if exists company_permission_update on public.%I', v_table);
    execute format('drop policy if exists company_permission_delete on public.%I', v_table);

    if v_table = 'erp_domain_audit_log' then
      -- SECURITY DEFINER audit triggers write events; clients get read-only access.
      execute format(
        'create policy company_permission_select on public.%I for select using (public.is_approved(auth.uid()) and company_id = public.current_company_id() and public.has_company_access(company_id))',
        v_table
      );
    else
      execute format(
        'create policy company_permission_select on public.%I for select using (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view))',
        v_table, v_table
      );
      execute format(
        'create policy company_permission_insert on public.%I for insert with check (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view and a.can_create))',
        v_table, v_table
      );
      execute format(
        'create policy company_permission_update on public.%I for update using (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view and a.can_edit)) with check (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view and a.can_edit))',
        v_table, v_table, v_table
      );
      execute format(
        'create policy company_permission_delete on public.%I for delete using (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view and a.can_delete))',
        v_table, v_table
      );
    end if;
  end loop;
end
$migration$;
