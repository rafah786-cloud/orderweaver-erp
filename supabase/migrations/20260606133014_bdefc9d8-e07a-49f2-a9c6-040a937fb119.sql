
DROP POLICY IF EXISTS "nl insert authed" ON public.notification_log;
CREATE POLICY "nl insert staff" ON public.notification_log
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'sales'::app_role)
    OR has_role(auth.uid(),'production'::app_role)
    OR has_role(auth.uid(),'accountant'::app_role)
    OR has_role(auth.uid(),'hr'::app_role)
  );
