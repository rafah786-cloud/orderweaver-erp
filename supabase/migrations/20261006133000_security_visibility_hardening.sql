-- Security visibility hardening
-- Keep business-sensitive AI artifacts and notification configuration behind
-- the same roles exposed by the application, and prevent direct audit-log
-- fabrication from client sessions.

BEGIN;

DROP POLICY IF EXISTS "Approved staff can read AI documents" ON public.ai_documents;
CREATE POLICY "Analyst roles can read AI documents"
  ON public.ai_documents FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'production')
  );

DROP POLICY IF EXISTS "Approved staff can read AI document chunks" ON public.ai_document_chunks;
CREATE POLICY "Analyst roles can read AI document chunks"
  ON public.ai_document_chunks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'production')
  );

DROP POLICY IF EXISTS "Approved staff can read AI insights" ON public.ai_insights;
CREATE POLICY "Analyst roles can read AI insights"
  ON public.ai_insights FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'production')
  );

DROP POLICY IF EXISTS "Signed-in users can append to the AI audit log" ON public.ai_audit_log;
REVOKE INSERT ON public.ai_audit_log FROM authenticated;

DROP POLICY IF EXISTS "ne read staff" ON public.notification_events;
CREATE POLICY "ne read admin"
  ON public.notification_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "nec read staff" ON public.notification_event_channels;
CREATE POLICY "nec read admin"
  ON public.notification_event_channels FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "nl insert authed" ON public.notification_log;
DROP POLICY IF EXISTS "nl insert staff" ON public.notification_log;
REVOKE INSERT ON public.notification_log FROM authenticated;

COMMIT;
