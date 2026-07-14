DROP POLICY IF EXISTS "ens read auth" ON public.employee_notification_subscriptions;

CREATE POLICY "ens read admin/hr"
  ON public.employee_notification_subscriptions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role));
