BEGIN;

-- SECURITY DEFINER RPCs bypass ordinary RLS checks. Harden the shared
-- authorization helpers as well, so a pending/rejected profile cannot reuse
-- an old role assignment or company membership to call an elevated RPC.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT p.active_company_id
  FROM public.profiles p
  JOIN public.companies c
    ON c.id = p.active_company_id
   AND c.is_active = true
  WHERE p.id = auth.uid()
    AND p.status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM public.user_company_access a
      WHERE a.user_id = auth.uid()
        AND a.company_id = p.active_company_id
        AND a.can_view = true
    )
$function$;

CREATE OR REPLACE FUNCTION public.has_company_access(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.is_approved(auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.user_company_access
       WHERE user_id = auth.uid()
         AND company_id = _company_id
         AND can_view = true
     )
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT _user_id = auth.uid()
     AND public.is_approved(auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.user_roles
       WHERE user_id = auth.uid()
         AND role = _role
     )
$function$;

CREATE OR REPLACE FUNCTION public.current_user_roles()
RETURNS SETOF public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT role
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND public.is_approved(auth.uid())
$function$;

CREATE OR REPLACE FUNCTION public.set_active_company(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.is_approved(auth.uid()) THEN
    RAISE EXCEPTION 'Approved profile required';
  END IF;
  IF NOT public.has_company_access(_company_id) THEN
    RAISE EXCEPTION 'You do not have access to this company';
  END IF;
  UPDATE public.profiles
  SET active_company_id = _company_id, updated_at = now()
  WHERE id = auth.uid() AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved profile not found';
  END IF;
  RETURN _company_id;
END
$function$;

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
