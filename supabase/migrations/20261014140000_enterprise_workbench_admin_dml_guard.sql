-- Restrictive authorization for the generic enterprise workbench.
-- The workbench UI is admin-only; enforce that at the database boundary too.
-- RESTRICTIVE policies are ANDed with existing policies, so company-scope policies
-- and any additional permissive policy cannot accidentally grant non-admin writes.
-- Reads are intentionally unchanged and remain governed by company-scope SELECT RLS.

DO $migration$
DECLARE
  t text;
  policy_name text;
  statement text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'work_centers',
    'mps_plans',
    'routings',
    'mrp_runs',
    'production_operations',
    'quality_plans',
    'quality_inspections',
    'quality_nonconformances',
    'quality_capa_actions',
    'maintenance_assets',
    'maintenance_plans',
    'maintenance_work_orders',
    'bom_revisions',
    'engineering_change_orders',
    'rfqs',
    'supplier_quotes',
    'warehouse_zones',
    'warehouse_bins',
    'stock_counts',
    'budgets',
    'bank_reconciliations',
    'fixed_assets',
    'crm_leads',
    'crm_opportunities',
    'crm_activities',
    'shipments',
    'sales_returns',
    'projects',
    'project_tasks',
    'workflow_definitions',
    'workflow_instances',
    'data_quality_issues',
    'ai_data_freshness'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOREACH policy_name IN ARRAY ARRAY[
      'enterprise_workbench_admin_insert',
      'enterprise_workbench_admin_update',
      'enterprise_workbench_admin_delete'
    ] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, t);
    END LOOP;

    statement := format(
      'CREATE POLICY enterprise_workbench_admin_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_approved(auth.uid()) AND public.has_role(auth.uid(), ''admin''::public.app_role) AND company_id = public.current_company_id() AND public.has_company_access(company_id))',
      t
    );
    EXECUTE statement;

    statement := format(
      'CREATE POLICY enterprise_workbench_admin_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_approved(auth.uid()) AND public.has_role(auth.uid(), ''admin''::public.app_role) AND company_id = public.current_company_id() AND public.has_company_access(company_id)) WITH CHECK (public.is_approved(auth.uid()) AND public.has_role(auth.uid(), ''admin''::public.app_role) AND company_id = public.current_company_id() AND public.has_company_access(company_id))',
      t
    );
    EXECUTE statement;

    statement := format(
      'CREATE POLICY enterprise_workbench_admin_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_approved(auth.uid()) AND public.has_role(auth.uid(), ''admin''::public.app_role) AND company_id = public.current_company_id() AND public.has_company_access(company_id))',
      t
    );
    EXECUTE statement;
  END LOOP;
END
$migration$;
