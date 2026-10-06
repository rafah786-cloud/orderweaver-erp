-- Security visibility hardening
-- AI documents/insights and notification configuration must respect role and
-- company boundaries; client sessions must not fabricate audit/notification logs.

BEGIN;

ALTER TABLE public.ai_documents
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.ai_documents d
SET company_id = COALESCE(
  (SELECT s.company_id FROM public.suppliers s WHERE s.id = d.supplier_id),
  (SELECT p.company_id FROM public.parties p WHERE p.id = d.party_id),
  (SELECT id FROM public.companies WHERE is_default = true LIMIT 1)
)
WHERE d.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_documents_company_id
  ON public.ai_documents(company_id);

ALTER TABLE public.ai_insights
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.ai_insights i
SET company_id = (SELECT id FROM public.companies WHERE is_default = true LIMIT 1)
WHERE i.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_insights_company_id
  ON public.ai_insights(company_id);

ALTER TABLE public.ai_insights
  DROP CONSTRAINT IF EXISTS ai_insights_kind_scope_key_key;

ALTER TABLE public.ai_insights
  DROP CONSTRAINT IF EXISTS ai_insights_kind_scope_company_key;

ALTER TABLE public.ai_insights
  ADD CONSTRAINT ai_insights_kind_scope_company_key
  UNIQUE (kind, scope_key, company_id);

DROP POLICY IF EXISTS "Approved staff can read AI documents" ON public.ai_documents;
DROP POLICY IF EXISTS "Analyst roles can read AI documents" ON public.ai_documents;
CREATE POLICY "Analyst roles can read AI documents"
  ON public.ai_documents FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'accountant')
      OR public.has_role(auth.uid(), 'sales')
      OR public.has_role(auth.uid(), 'production')
    )
  );

DROP POLICY IF EXISTS "Approved staff can read AI document chunks" ON public.ai_document_chunks;
DROP POLICY IF EXISTS "Analyst roles can read AI document chunks" ON public.ai_document_chunks;
CREATE POLICY "Analyst roles can read AI document chunks"
  ON public.ai_document_chunks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_documents d
      WHERE d.id = ai_document_chunks.document_id
        AND d.company_id = public.current_company_id()
        AND public.has_company_access(d.company_id)
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.has_role(auth.uid(), 'accountant')
          OR public.has_role(auth.uid(), 'sales')
          OR public.has_role(auth.uid(), 'production')
        )
    )
  );

DROP POLICY IF EXISTS "Approved staff can read AI insights" ON public.ai_insights;
DROP POLICY IF EXISTS "Analyst roles can read AI insights" ON public.ai_insights;
CREATE POLICY "Analyst roles can read AI insights"
  ON public.ai_insights FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.has_company_access(company_id)
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'accountant')
      OR public.has_role(auth.uid(), 'sales')
      OR public.has_role(auth.uid(), 'production')
    )
  );

DROP POLICY IF EXISTS "Signed-in users can append to the AI audit log" ON public.ai_audit_log;
REVOKE INSERT ON public.ai_audit_log FROM authenticated;

DROP POLICY IF EXISTS "ne read staff" ON public.notification_events;
DROP POLICY IF EXISTS "ne read admin" ON public.notification_events;
CREATE POLICY "ne read admin"
  ON public.notification_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "nec read staff" ON public.notification_event_channels;
DROP POLICY IF EXISTS "nec read admin" ON public.notification_event_channels;
CREATE POLICY "nec read admin"
  ON public.notification_event_channels FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "nl insert authed" ON public.notification_log;
DROP POLICY IF EXISTS "nl insert staff" ON public.notification_log;
REVOKE INSERT ON public.notification_log FROM authenticated;

COMMIT;
