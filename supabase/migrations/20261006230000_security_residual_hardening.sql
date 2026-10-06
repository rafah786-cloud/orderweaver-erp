-- Final residual security hardening.
-- Safe, non-destructive: only tightens privileges/policies and scopes existing audit rows.

BEGIN;

ALTER TABLE public.ai_audit_log
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

UPDATE public.ai_audit_log a
SET company_id = COALESCE(
  CASE a.ref_table
    WHEN 'invoices' THEN (SELECT company_id FROM public.invoices x WHERE x.id=a.ref_id)
    WHEN 'sales_orders' THEN (SELECT company_id FROM public.sales_orders x WHERE x.id=a.ref_id)
    WHEN 'purchase_bills' THEN (SELECT company_id FROM public.purchase_bills x WHERE x.id=a.ref_id)
    WHEN 'production_orders' THEN (SELECT company_id FROM public.production_orders x WHERE x.id=a.ref_id)
    WHEN 'parties' THEN (SELECT company_id FROM public.parties x WHERE x.id=a.ref_id)
    WHEN 'suppliers' THEN (SELECT company_id FROM public.suppliers x WHERE x.id=a.ref_id)
    WHEN 'vouchers' THEN (SELECT company_id FROM public.vouchers x WHERE x.id=a.ref_id)
    WHEN 'ai_documents' THEN (SELECT company_id FROM public.ai_documents x WHERE x.id=a.ref_id)
    WHEN 'ai_proposals' THEN (SELECT company_id FROM public.ai_proposals x WHERE x.id=a.ref_id)
    ELSE NULL
  END,
  (SELECT active_company_id FROM public.profiles p WHERE p.id=a.user_id),
  (SELECT id FROM public.companies WHERE code='ABOOD' AND is_active=true)
)
WHERE a.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_audit_log_company_id
  ON public.ai_audit_log(company_id);

ALTER TABLE public.ai_audit_log
  ALTER COLUMN company_id SET NOT NULL;

REVOKE INSERT, UPDATE, DELETE ON public.ai_audit_log FROM authenticated;

DROP POLICY IF EXISTS "Admins can read the AI audit log" ON public.ai_audit_log;
DROP POLICY IF EXISTS "ai audit active company" ON public.ai_audit_log;

CREATE POLICY "Admins can read the AI audit log"
  ON public.ai_audit_log
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    AND company_id=current_company_id()
    AND has_company_access(company_id)
  );

CREATE POLICY "ai audit active company"
  ON public.ai_audit_log AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id=current_company_id() AND has_company_access(company_id))
  WITH CHECK (company_id=current_company_id() AND has_company_access(company_id));

REVOKE INSERT, DELETE ON public.in_app_notifications FROM authenticated;
DROP POLICY IF EXISTS "ian insert admin" ON public.in_app_notifications;
DROP POLICY IF EXISTS "ian admin read" ON public.in_app_notifications;
DROP POLICY IF EXISTS "ian read own" ON public.in_app_notifications;
DROP POLICY IF EXISTS "ian update own" ON public.in_app_notifications;

CREATE POLICY "ian read own"
  ON public.in_app_notifications
  FOR SELECT TO authenticated
  USING (user_id=auth.uid());

CREATE POLICY "ian update own"
  ON public.in_app_notifications
  FOR UPDATE TO authenticated
  USING (user_id=auth.uid())
  WITH CHECK (user_id=auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.notification_log FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.voucher_audit_log FROM authenticated;
DROP POLICY IF EXISTS "audit insert admin/accountant" ON public.voucher_audit_log;
DROP POLICY IF EXISTS "audit read" ON public.voucher_audit_log;
DROP POLICY IF EXISTS "voucher audit active company" ON public.voucher_audit_log;

CREATE POLICY "audit read"
  ON public.voucher_audit_log
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant'))
    AND EXISTS (
      SELECT 1
      FROM public.vouchers v
      WHERE v.id=voucher_audit_log.voucher_id
        AND v.company_id=current_company_id()
        AND has_company_access(v.company_id)
    )
  );

CREATE POLICY "voucher audit active company"
  ON public.voucher_audit_log AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.vouchers v
      WHERE v.id=voucher_audit_log.voucher_id
        AND v.company_id=current_company_id()
        AND has_company_access(v.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.vouchers v
      WHERE v.id=voucher_audit_log.voucher_id
        AND v.company_id=current_company_id()
        AND has_company_access(v.company_id)
    )
  );

-- Subscription/configuration tables are only accessed through protected server functions.
REVOKE INSERT, UPDATE, DELETE ON public.employee_notification_subscriptions FROM authenticated;
GRANT SELECT ON public.employee_notification_subscriptions TO authenticated;

-- Tally migration data stays admin-only and company constrained. The server functions
-- already validate the selected active company before staging/validation/reconciliation.
-- No data is deleted or rewritten here.

COMMIT;
