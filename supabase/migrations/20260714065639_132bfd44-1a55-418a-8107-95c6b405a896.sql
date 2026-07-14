DROP POLICY IF EXISTS "ens read admin/hr" ON public.employee_notification_subscriptions;
CREATE POLICY "ens read admin/hr" ON public.employee_notification_subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr'::app_role));