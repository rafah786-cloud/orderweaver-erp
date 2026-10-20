BEGIN;

-- Finance data must not be readable through direct PostgREST calls merely
-- because a user has generic company membership. The frontend route guard is
-- not a database security boundary.
--
-- Put the complete role/approval/company decision in one row-dependent helper.
-- This prevents policy planners from treating the role-only clauses as
-- variable-free restrictions, and makes the same authorization rule auditable.
CREATE OR REPLACE FUNCTION public.can_access_enterprise_finance(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.is_approved(auth.uid())
     AND (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'accountant'::public.app_role)
     )
     AND _company_id = public.current_company_id()
     AND public.has_company_access(_company_id)
$function$;

REVOKE ALL ON FUNCTION public.can_access_enterprise_finance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_enterprise_finance(uuid) TO authenticated;

-- Restrictive policies are ANDed with existing company/CRUD policies, so this
-- does not grant privileges or bypass company scoping. It only narrows access.
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
       USING (public.can_access_enterprise_finance(company_id))
       WITH CHECK (public.can_access_enterprise_finance(company_id))',
      t
    );
  END LOOP;
END
$migration$;

COMMIT;
