-- Restrict direct invocation of trigger-only audit logic and anonymous sales-order RPC access.
-- Authenticated sales users retain the explicit grant needed by the guarded RPC.
BEGIN;

-- This trigger function was referenced by the privilege migration but was
-- never defined in the authoritative Supabase CLI chain. Provide the intended
-- trigger-only audit writer for the additive enterprise domains. Snapshots are
-- deliberately allowlisted; free-form notes, descriptions, contact details,
-- endpoints, credentials and arbitrary JSON are not copied into the audit log.
CREATE OR REPLACE FUNCTION public.audit_enterprise_domain_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  row_before jsonb;
  row_after jsonb;
  snapshot_before jsonb := '{}'::jsonb;
  snapshot_after jsonb := '{}'::jsonb;
  audit_company uuid;
  audit_entity_id uuid;
  audit_module text;
BEGIN
  row_before := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  row_after := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  audit_company := NULLIF(COALESCE(row_after->>'company_id', row_before->>'company_id'), '')::uuid;
  audit_entity_id := NULLIF(COALESCE(row_after->>'id', row_before->>'id'), '')::uuid;
  IF audit_company IS NULL OR audit_entity_id IS NULL THEN
    RAISE EXCEPTION 'Enterprise audit requires a UUID entity ID and company ID';
  END IF;

  audit_module := CASE
    WHEN TG_TABLE_NAME LIKE 'quality_%' THEN 'quality'
    WHEN TG_TABLE_NAME LIKE 'maintenance_%' THEN 'maintenance'
    WHEN TG_TABLE_NAME LIKE 'bom_%' OR TG_TABLE_NAME LIKE 'engineering_change_%' THEN 'engineering'
    WHEN TG_TABLE_NAME LIKE 'mrp_%' OR TG_TABLE_NAME LIKE 'mps_%' OR TG_TABLE_NAME LIKE 'routing%' OR TG_TABLE_NAME LIKE 'work_center%' OR TG_TABLE_NAME='production_operations' THEN 'production'
    WHEN TG_TABLE_NAME LIKE 'warehouse_%' OR TG_TABLE_NAME LIKE 'stock_count%' THEN 'warehouse'
    WHEN TG_TABLE_NAME LIKE 'rfq%' OR TG_TABLE_NAME LIKE 'supplier_quote%' OR TG_TABLE_NAME='supplier_scorecards' OR TG_TABLE_NAME='three_way_match_results' THEN 'procurement'
    WHEN TG_TABLE_NAME LIKE 'crm_%' THEN 'crm'
    WHEN TG_TABLE_NAME LIKE 'sales_return%' OR TG_TABLE_NAME LIKE 'shipment%' THEN 'sales_logistics'
    WHEN TG_TABLE_NAME LIKE 'project%' THEN 'projects'
    WHEN TG_TABLE_NAME LIKE 'workflow_%' THEN 'workflow'
    WHEN TG_TABLE_NAME LIKE 'integration_%' THEN 'integrations'
    WHEN TG_TABLE_NAME LIKE 'backup_%' THEN 'backup'
    ELSE 'enterprise'
  END;

  IF row_before IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) INTO snapshot_before
    FROM jsonb_each(row_before) AS item(k,v)
    WHERE k = ANY (ARRAY[
      'status','code','revision','priority','severity','due_date','effective_from','effective_to',
      'order_type','quantity','stage','resolved','active','is_active','action_type','result',
      'disposition','sequence_no','operation_no','inspection_number','work_order_number','nc_number',
      'rfq_number','plan_number','run_number','asset_code','asset_type','criticality','production_order_id',
      'model_id','stock_item_id','supplier_id','work_center_id','routing_id','bom_revision_id',
      'quality_plan_id','inspection_id','completed_at','released_at','approved_at'
    ]);
  END IF;

  IF row_after IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) INTO snapshot_after
    FROM jsonb_each(row_after) AS item(k,v)
    WHERE k = ANY (ARRAY[
      'status','code','revision','priority','severity','due_date','effective_from','effective_to',
      'order_type','quantity','stage','resolved','active','is_active','action_type','result',
      'disposition','sequence_no','operation_no','inspection_number','work_order_number','nc_number',
      'rfq_number','plan_number','run_number','asset_code','asset_type','criticality','production_order_id',
      'model_id','stock_item_id','supplier_id','work_center_id','routing_id','bom_revision_id',
      'quality_plan_id','inspection_id','completed_at','released_at','approved_at'
    ]);
  END IF;

  INSERT INTO public.erp_domain_audit_log(
    company_id, module, entity_type, entity_id, action,
    before_data, after_data, actor_id
  ) VALUES (
    audit_company, audit_module, TG_TABLE_NAME, audit_entity_id, lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN snapshot_before ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN snapshot_after ELSE NULL END,
    auth.uid()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- Record create/alter/delete events for enterprise domains that expose the
-- canonical UUID id/company_id pair. Skip the audit sink itself to avoid recursion.
DO $audit_triggers$
DECLARE
  t text;
  trigger_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_data_freshness','backup_verification_runs',
    'bom_revision_lines','bom_revisions',
    'data_quality_issues','engineering_change_order_lines','engineering_change_orders',
    'integration_health','integration_runs',
    'maintenance_assets','maintenance_meter_readings','maintenance_plans','maintenance_spares',
    'maintenance_work_orders','master_data_quality_rules','mps_lines','mps_plans',
    'mrp_exceptions','mrp_planned_orders','mrp_runs','production_operations','project_tasks','projects',
    'quality_capa_actions','quality_inspections','quality_nonconformances','quality_plans','quality_results',
    'rfq_lines','rfqs','routing_operation_dependencies','routing_operations','routings',
    'sales_return_lines','sales_returns','shipment_lines','shipments','stock_count_lines','stock_counts',
    'supplier_quote_lines','supplier_quotes','supplier_scorecards','three_way_match_results',
    'warehouse_bins','warehouse_zones','work_center_calendars','work_centers',
    'workflow_definitions','workflow_instances','workflow_tasks'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='company_id' AND udt_name='uuid')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='id' AND udt_name='uuid')
    THEN
      trigger_name := 'trg_enterprise_audit_' || left(t, 35);
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, t);
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_enterprise_domain_change()',
        trigger_name, t
      );
    END IF;
  END LOOP;
END;
$audit_triggers$;

REVOKE ALL ON FUNCTION public.audit_enterprise_domain_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_sales_order_atomic(uuid, date, date, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order_atomic(uuid, date, date, text, text, jsonb) TO authenticated, service_role;

COMMIT;
