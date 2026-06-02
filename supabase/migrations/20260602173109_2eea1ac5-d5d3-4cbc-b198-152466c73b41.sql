
-- 1. shift_settings: restrict SELECT to admin/hr
DROP POLICY IF EXISTS "shift read" ON public.shift_settings;
CREATE POLICY "shift read admin/hr" ON public.shift_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr'::app_role));

-- 2. user_roles: explicit admin-only write policies (block self-escalation)
CREATE POLICY "user_roles admin insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "user_roles admin update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "user_roles admin delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. punch_events: remove from realtime publication (server-side admin writes only; clients should not subscribe directly)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'punch_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.punch_events';
  END IF;
END $$;

-- 4. Lock down SECURITY DEFINER trigger/internal functions: revoke EXECUTE from anon/authenticated.
-- These are invoked only by triggers or trusted server code (service_role), not via PostgREST.
REVOKE EXECUTE ON FUNCTION public.apply_punch_to_attendance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_production_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_purchase_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_sales_stock_out() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_attendance_day(uuid, date) FROM PUBLIC, anon;
-- recalc_attendance_day is called from server fns under service_role, so authenticated EXECUTE is not needed
REVOKE EXECUTE ON FUNCTION public.recalc_attendance_day(uuid, date) FROM authenticated;

-- 5. Fix mutable search_path on touch_updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;
