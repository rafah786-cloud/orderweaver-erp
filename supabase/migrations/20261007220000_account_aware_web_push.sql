BEGIN;

-- Per-user, per-device Web Push subscriptions.
-- The endpoint/key material is sensitive and is never exposed to other users.
CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  expiration_time bigint,
  user_agent text,
  device_label text,
  is_active boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_push_subscriptions_endpoint_key UNIQUE (endpoint),
  CONSTRAINT web_push_subscriptions_endpoint_https CHECK (endpoint ~ '^https://'),
  CONSTRAINT web_push_subscriptions_p256dh_len CHECK (length(p256dh) BETWEEN 40 AND 100),
  CONSTRAINT web_push_subscriptions_auth_len CHECK (length(auth) BETWEEN 16 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user
  ON public.web_push_subscriptions(user_id, company_id, is_active);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_push_subscriptions TO authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;

DROP POLICY IF EXISTS "wps own devices" ON public.web_push_subscriptions;
CREATE POLICY "wps own devices"
  ON public.web_push_subscriptions
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND company_id = public.current_company_id()
    AND public.has_company_access(company_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = public.current_company_id()
    AND public.has_company_access(company_id)
  );

DROP TRIGGER IF EXISTS trg_wps_updated ON public.web_push_subscriptions;
CREATE TRIGGER trg_wps_updated
  BEFORE UPDATE ON public.web_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Push is now a real provider channel, not a stub.
INSERT INTO public.notification_providers (
  channel, name, display_name, is_active, is_default, priority, config, secret_env_keys, notes
) VALUES (
  'push',
  'webpush',
  'Web Push',
  true,
  true,
  1,
  '{}'::jsonb,
  '["WEB_PUSH_VAPID_PRIVATE_JWK","WEB_PUSH_VAPID_SUBJECT"]'::jsonb,
  'Standards-based Web Push using Push API, Service Workers and VAPID. Public key is derived from the private JWK.'
)
ON CONFLICT (channel, name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    is_active = EXCLUDED.is_active,
    is_default = EXCLUDED.is_default,
    priority = EXCLUDED.priority,
    secret_env_keys = EXCLUDED.secret_env_keys,
    notes = EXCLUDED.notes;

-- Existing staff events become first-class notification-engine events so the
-- same routing engine can fan out to in-app, WhatsApp and Web Push.
INSERT INTO public.notification_events(event_key,label,description,category,is_active)
VALUES
  ('staff.sales_order.created','New Sales Order','A sales order has been created and requires operational awareness.','staff',true),
  ('staff.purchase_request.created','New Purchase Request','A purchase request has been created.','staff',true),
  ('staff.approval.pending','Pending Approval','An approval is awaiting action.','staff',true),
  ('staff.invoice.overdue','Invoice Overdue','An invoice is overdue.','staff',true),
  ('staff.payment.received','Payment Received','A customer payment has been recorded.','staff',true),
  ('staff.dispatch.ready','Dispatch Ready','A production order is ready for dispatch.','staff',true),
  ('production_order.ready','Production Order Ready','A customer order is ready for dispatch.','customer',true),
  ('invoice.issued','Invoice Issued','A customer invoice has been issued.','customer',true),
  ('invoice.paid','Invoice Paid','A customer invoice has been marked paid.','customer',true),
  ('dispatch.update','Dispatch Update','A customer dispatch status has changed.','customer',true),
  ('ledger.statement_ready','Statement Ready','A customer ledger statement is ready.','customer',true)
ON CONFLICT (event_key) DO NOTHING;

-- Ensure push/in-app routing rows exist. Transactional events are enabled for
-- push; actual delivery remains safely skipped until VAPID secrets are configured.
-- Production is an operational recipient of newly created sales orders.\nINSERT INTO public.employee_notification_subscriptions(company_id,department,event_key,is_active)\nSELECT c.id,'Production','staff.sales_order.created',true\nFROM public.companies c\nWHERE c.code IN ('ABOOD','ABRAZ','ABOOD_MGMT','ABRAZ_MGMT')\nON CONFLICT (company_id,department,event_key) DO NOTHING;\n\nINSERT INTO public.notification_event_channels(event_key,channel,is_enabled)
SELECT e.event_key,'push',true
FROM public.notification_events e
WHERE e.event_key IN (
  'sales_order.created','purchase_order.approved','invoice.generated','payment.received',
  'dispatch.created','customer.registered','vendor.registered',
  'staff.sales_order.created','staff.purchase_request.created','staff.approval.pending',
  'staff.invoice.overdue','staff.payment.received','staff.dispatch.ready',
  'production_order.ready','invoice.issued','invoice.paid','dispatch.update','ledger.statement_ready'
)
ON CONFLICT (event_key,channel) DO UPDATE SET is_enabled = true;

COMMIT;