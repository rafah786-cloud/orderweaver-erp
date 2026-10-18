BEGIN;

-- Finance data must not be readable through direct PostgREST calls merely
-- because a user has generic company membership. The frontend route guard is
-- not a database security boundary.
--
-- The current workspace policy allows /banking and finance workspaces only to
-- Admin/Accountant. Apply that same role boundary to the underlying financial
-- tables. RESTRICTIVE policies are ANDed with existing company/CRUD policies,
-- so this does not grant privileges or bypass company scoping.
DO $migration$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budgets', 'bank_reconciliations', 'fixed_assets'] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE EXCEPTION 'Expected finance table public.% is missing; refusing partial security migration', t;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'company_id'
    ) THEN
      RAISE EXCEPTION 'Expected company_id on public.%; refusing partial security migration', t;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS enterprise_finance_role_guard ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY enterprise_finance_role_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
       USING (
         public.is_approved(auth.uid())
         AND (public.has_role(auth.uid(), ''admin''::public.app_role)
              OR public.has_role(auth.uid(), ''accountant''::public.app_role))
         AND company_id = public.current_company_id()
         AND public.has_company_access(company_id)
       )
       WITH CHECK (
         public.is_approved(auth.uid())
         AND (public.has_role(auth.uid(), ''admin''::public.app_role)
              OR public.has_role(auth.uid(), ''accountant''::public.app_role))
         AND company_id = public.current_company_id()
         AND public.has_company_access(company_id)
       )',
      t
    );
  END LOOP;
END
$migration$;

COMMIT;
