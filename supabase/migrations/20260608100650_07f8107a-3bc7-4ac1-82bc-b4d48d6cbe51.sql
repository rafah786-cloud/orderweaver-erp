
-- 1) Subscriptions table: department -> event_key
CREATE TABLE public.employee_notification_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  event_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department, event_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_notification_subscriptions TO authenticated;
GRANT ALL ON public.employee_notification_subscriptions TO service_role;

ALTER TABLE public.employee_notification_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ens read auth"
  ON public.employee_notification_subscriptions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ens write admin/hr"
  ON public.employee_notification_subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE TRIGGER ens_touch_updated_at
  BEFORE UPDATE ON public.employee_notification_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) WhatsApp templates for staff fan-out events
INSERT INTO public.whatsapp_templates (template_name, language_code, event_key, variables, is_active) VALUES
  ('STAFF_NEW_SALES_ORDER',      'en', 'staff.sales_order.created',     '["employee_name","order_no","customer_name","order_value"]'::jsonb, true),
  ('STAFF_NEW_PURCHASE_REQUEST', 'en', 'staff.purchase_request.created','["employee_name","po_number","vendor_name","po_value"]'::jsonb, true),
  ('STAFF_PENDING_APPROVAL',     'en', 'staff.approval.pending',        '["employee_name","ref_type","ref_no","details"]'::jsonb, true),
  ('STAFF_INVOICE_OVERDUE',      'en', 'staff.invoice.overdue',         '["employee_name","invoice_no","customer_name","amount","days_overdue"]'::jsonb, true),
  ('STAFF_PAYMENT_RECEIVED',     'en', 'staff.payment.received',        '["employee_name","receipt_no","customer_name","payment_amount"]'::jsonb, true),
  ('STAFF_DISPATCH_READY',       'en', 'staff.dispatch.ready',          '["employee_name","order_no","customer_name","tracking_no","transporter_name"]'::jsonb, true)
ON CONFLICT (template_name) DO UPDATE
SET event_key = EXCLUDED.event_key,
    variables = EXCLUDED.variables,
    is_active = true,
    language_code = EXCLUDED.language_code;

-- 3) Default department-to-event subscriptions
INSERT INTO public.employee_notification_subscriptions (department, event_key) VALUES
  ('Sales',      'staff.sales_order.created'),
  ('Sales',      'staff.dispatch.ready'),
  ('Accounts',   'staff.payment.received'),
  ('Accounts',   'staff.invoice.overdue'),
  ('Purchase',   'staff.purchase_request.created'),
  ('Purchase',   'staff.approval.pending'),
  ('Warehouse',  'staff.dispatch.ready'),
  ('Management', 'staff.sales_order.created'),
  ('Management', 'staff.purchase_request.created'),
  ('Management', 'staff.approval.pending'),
  ('Management', 'staff.invoice.overdue'),
  ('Management', 'staff.payment.received'),
  ('Management', 'staff.dispatch.ready')
ON CONFLICT (department, event_key) DO NOTHING;
