BEGIN;

-- Defense in depth: a valid Supabase token is not enough to access ERP data.
-- Every authenticated query/mutation against an RLS-protected public table
-- must also belong to an approved profile. Pending users still need to read
-- their own profile so the UI can display account status, so profiles is the
-- deliberate exception. This is a RESTRICTIVE policy, meaning it is ANDed
-- with existing permissive policies and cannot be bypassed by another grant.
DO $migration$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND c.relname <> 'profiles'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS approved_profile_required ON public.%I',
      t.relname
    );
    EXECUTE format(
      'CREATE POLICY approved_profile_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_approved(auth.uid())) WITH CHECK (public.is_approved(auth.uid()))',
      t.relname
    );
  END LOOP;
END
$migration$;

-- These HR/AI governance tables are currently not read or written by an
-- application workflow. Their old company-only policies let any account
-- with view membership perform broad CRUD, including records that contain
-- sensitive HR lifecycle/performance data or AI action/configuration data.
-- Fail closed for browser/API roles until purpose-built role/record-owner
-- policies and workflow tests are delivered. Preserve rows and service_role
-- grants so authorized server-side maintenance is not disrupted.
DO $lockdown$
DECLARE
  t text;
  p record;
  locked_tables text[] := ARRAY[
    'ai_action_proposals',
    'ai_alerts',
    'ai_answer_evaluations',
    'ai_context_bindings',
    'ai_forecast_models',
    'ai_skills',
    'employee_leave_requests',
    'employee_lifecycle_events',
    'employee_performance_cycles',
    'employee_training_records'
  ];
BEGIN
  FOREACH t IN ARRAY locked_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname LIKE 'company_scope%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      t
    );
  END LOOP;
END
$lockdown$;

COMMIT;
