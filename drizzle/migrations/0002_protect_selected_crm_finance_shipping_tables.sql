-- Access-control only: no business rows or accounting functions are changed.
DO $migration$
DECLARE
  t text;
  action text;
  permission text;
  predicate text;
  clause text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_opportunities','crm_activities','shipments','budget_lines','bank_reconciliation_items','crm_leads','budgets','fixed_asset_depreciation','bank_reconciliations','fixed_assets'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOREACH action IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      permission := CASE action WHEN 'SELECT' THEN 'can_view' WHEN 'INSERT' THEN 'can_create' WHEN 'UPDATE' THEN 'can_edit' ELSE 'can_delete' END;
      predicate := format('public.is_approved(auth.uid()) AND company_id = public.current_company_id() AND EXISTS (SELECT 1 FROM public.user_company_access a WHERE a.user_id = auth.uid() AND a.company_id = %I.company_id AND a.can_view AND a.%I)', t, permission);
      clause := CASE WHEN action = 'INSERT' THEN '' ELSE 'USING (' || predicate || ') ' END;
      IF action IN ('INSERT','UPDATE') THEN clause := clause || 'WITH CHECK (' || predicate || ')'; END IF;
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated %s', 'selected_' || lower(action), t, action, clause);
    END LOOP;
  END LOOP;
END
$migration$;
CREATE POLICY selected_parent_scope ON public.budget_lines AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.budgets p WHERE p.id = budget_lines.budget_id AND p.company_id = budget_lines.company_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.budgets p WHERE p.id = budget_lines.budget_id AND p.company_id = budget_lines.company_id));
CREATE POLICY selected_parent_scope ON public.bank_reconciliation_items AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.bank_reconciliations p WHERE p.id = bank_reconciliation_items.bank_reconciliation_id AND p.company_id = bank_reconciliation_items.company_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.bank_reconciliations p WHERE p.id = bank_reconciliation_items.bank_reconciliation_id AND p.company_id = bank_reconciliation_items.company_id));
CREATE POLICY selected_parent_scope ON public.fixed_asset_depreciation AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.fixed_assets p WHERE p.id = fixed_asset_depreciation.fixed_asset_id AND p.company_id = fixed_asset_depreciation.company_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.fixed_assets p WHERE p.id = fixed_asset_depreciation.fixed_asset_id AND p.company_id = fixed_asset_depreciation.company_id));