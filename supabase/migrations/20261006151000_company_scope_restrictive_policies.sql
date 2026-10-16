-- Make company boundaries restrictive so they AND with role/ownership policies.
-- The earlier multi-company policies were permissive, which meant a role policy
-- could still expose another company's rows. This migration makes every
-- company_scope_* policy an AND-style security boundary.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'company_scope_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      r.policyname,
      r.schemaname,
      r.tablename,
      r.qual,
      COALESCE(r.with_check, r.qual)
    );
  END LOOP;
END $$;

COMMIT;
