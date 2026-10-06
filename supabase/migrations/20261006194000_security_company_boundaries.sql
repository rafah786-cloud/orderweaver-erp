BEGIN;

-- Harden company boundaries at the database policy layer for records that
-- previously relied only on permissive role policies.

ALTER TABLE public.employee_notification_subscriptions
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
UPDATE public.employee_notification_subscriptions
SET company_id = (SELECT id FROM public.companies WHERE code='ABOOD')
WHERE company_id IS NULL;
ALTER TABLE public.employee_notification_subscriptions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.employee_notification_subscriptions
  DROP CONSTRAINT IF EXISTS employee_notification_subscriptions_department_event_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS employee_notification_subscriptions_company_department_event_key
  ON public.employee_notification_subscriptions(company_id,department,event_key);

INSERT INTO public.employee_notification_subscriptions(company_id,department,event_key,is_active)
SELECT c.id,v.department,v.event_key,true
FROM public.companies c
CROSS JOIN (VALUES
  ('Sales','staff.sales_order.created'),
  ('Sales','staff.dispatch.ready'),
  ('Accounts','staff.payment.received'),
  ('Accounts','staff.invoice.overdue'),
  ('Purchase','staff.purchase_request.created'),
  ('Purchase','staff.approval.pending'),
  ('Warehouse','staff.dispatch.ready'),
  ('Management','staff.sales_order.created'),
  ('Management','staff.purchase_request.created'),
  ('Management','staff.approval.pending'),
  ('Management','staff.invoice.overdue'),
  ('Management','staff.payment.received'),
  ('Management','staff.dispatch.ready')
) v(department,event_key)
WHERE c.is_active AND c.code IN ('ABOOD','ABRAZ','ABOOD_MGMT','ABRAZ_MGMT')
ON CONFLICT (company_id,department,event_key) DO NOTHING;

DROP POLICY IF EXISTS "ens read admin/hr" ON public.employee_notification_subscriptions;
DROP POLICY IF EXISTS "ens write admin/hr" ON public.employee_notification_subscriptions;
DROP POLICY IF EXISTS "ens read auth" ON public.employee_notification_subscriptions;
DROP POLICY IF EXISTS "ens company scope" ON public.employee_notification_subscriptions;
CREATE POLICY "ens company scope"
  ON public.employee_notification_subscriptions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

ALTER TABLE public.ai_proposals
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
UPDATE public.ai_proposals p
SET company_id=COALESCE(
  (SELECT d.company_id FROM public.ai_documents d WHERE d.id=p.source_document_id),
  (SELECT pr.active_company_id FROM public.profiles pr WHERE pr.id=p.created_by),
  (SELECT id FROM public.companies WHERE code='ABOOD')
)
WHERE p.company_id IS NULL;
ALTER TABLE public.ai_proposals ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_proposals_company_id ON public.ai_proposals(company_id);
DROP POLICY IF EXISTS "ai proposals company scope" ON public.ai_proposals;
CREATE POLICY "ai proposals company scope"
  ON public.ai_proposals AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

UPDATE public.ai_documents
SET company_id=COALESCE(company_id,(SELECT id FROM public.companies WHERE code='ABOOD'))
WHERE company_id IS NULL;
UPDATE public.ai_insights
SET company_id=COALESCE(company_id,(SELECT id FROM public.companies WHERE code='ABOOD'))
WHERE company_id IS NULL;

DROP POLICY IF EXISTS "ai documents company scope" ON public.ai_documents;
CREATE POLICY "ai documents company scope"
  ON public.ai_documents AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "ai insights company scope" ON public.ai_insights;
CREATE POLICY "ai insights company scope"
  ON public.ai_insights AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "device company scope" ON public.device_settings;
CREATE POLICY "device company scope"
  ON public.device_settings AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "tally runs company scope" ON public.tally_migration_runs;
CREATE POLICY "tally runs company scope"
  ON public.tally_migration_runs AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "tally rows company scope" ON public.tally_migration_rows;
CREATE POLICY "tally rows company scope"
  ON public.tally_migration_rows AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "tally issues company scope" ON public.tally_migration_issues;
CREATE POLICY "tally issues company scope"
  ON public.tally_migration_issues AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tally_migration_runs r
    WHERE r.id=tally_migration_issues.run_id
      AND r.company_id=public.current_company_id()
      AND public.has_company_access(r.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tally_migration_runs r
    WHERE r.id=tally_migration_issues.run_id
      AND r.company_id=public.current_company_id()
      AND public.has_company_access(r.company_id)
  ));

DROP POLICY IF EXISTS "tally snapshots company scope" ON public.tally_reconciliation_snapshots;
CREATE POLICY "tally snapshots company scope"
  ON public.tally_reconciliation_snapshots AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=public.current_company_id() AND public.has_company_access(company_id))
  WITH CHECK (company_id=public.current_company_id() AND public.has_company_access(company_id));

DROP POLICY IF EXISTS "vendor invites company scope" ON public.vendor_invites;
CREATE POLICY "vendor invites company scope"
  ON public.vendor_invites AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id=vendor_invites.supplier_id
      AND s.company_id=public.current_company_id()
      AND public.has_company_access(s.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id=vendor_invites.supplier_id
      AND s.company_id=public.current_company_id()
      AND public.has_company_access(s.company_id)
  ));

DROP POLICY IF EXISTS "notification log company scope" ON public.notification_log;
CREATE POLICY "notification log company scope"
  ON public.notification_log AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    (party_kind='customer' AND EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id=notification_log.party_id
        AND p.company_id=public.current_company_id()
        AND public.has_company_access(p.company_id)
    ))
    OR
    (party_kind='vendor' AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id=notification_log.party_id
        AND s.company_id=public.current_company_id()
        AND public.has_company_access(s.company_id)
    ))
    OR
    (party_kind IN ('staff','admin') AND EXISTS (
      SELECT 1 FROM public.user_company_access a
      WHERE a.user_id=notification_log.party_id
        AND a.company_id=public.current_company_id()
        AND a.can_view
    ))
  )
  WITH CHECK (
    (party_kind='customer' AND EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id=notification_log.party_id
        AND p.company_id=public.current_company_id()
        AND public.has_company_access(p.company_id)
    ))
    OR
    (party_kind='vendor' AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id=notification_log.party_id
        AND s.company_id=public.current_company_id()
        AND public.has_company_access(s.company_id)
    ))
    OR
    (party_kind IN ('staff','admin') AND EXISTS (
      SELECT 1 FROM public.user_company_access a
      WHERE a.user_id=notification_log.party_id
        AND a.company_id=public.current_company_id()
        AND a.can_view
    ))
  );

COMMIT;
