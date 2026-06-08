
-- 1. Allow in_app as a channel everywhere
ALTER TABLE public.notification_providers DROP CONSTRAINT IF EXISTS notification_providers_channel_check;
ALTER TABLE public.notification_providers ADD CONSTRAINT notification_providers_channel_check
  CHECK (channel = ANY (ARRAY['whatsapp','sms','email','push','in_app']));

-- 2. Event catalog
CREATE TABLE public.notification_events (
  event_key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ne admin manage" ON public.notification_events
  TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ne read staff" ON public.notification_events FOR SELECT
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
    OR public.has_role(auth.uid(),'production') OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'hr')
  );
CREATE TRIGGER trg_ne_updated BEFORE UPDATE ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Per-event, per-channel routing (admin toggles here)
CREATE TABLE public.notification_event_channels (
  event_key text NOT NULL REFERENCES public.notification_events(event_key) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel = ANY (ARRAY['whatsapp','sms','email','push','in_app'])),
  is_enabled boolean NOT NULL DEFAULT false,
  template_name text,
  subject_template text,
  body_template text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_key, channel)
);
GRANT SELECT ON public.notification_event_channels TO authenticated;
GRANT ALL ON public.notification_event_channels TO service_role;
ALTER TABLE public.notification_event_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nec admin manage" ON public.notification_event_channels
  TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "nec read staff" ON public.notification_event_channels FOR SELECT
  TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
    OR public.has_role(auth.uid(),'production') OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'hr')
  );
CREATE TRIGGER trg_nec_updated BEFORE UPDATE ON public.notification_event_channels
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. In-app notifications inbox
CREATE TABLE public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_key text,
  title text NOT NULL,
  body text NOT NULL,
  ref_table text,
  ref_id uuid,
  link text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_in_app_user_unread ON public.in_app_notifications(user_id, read_at);
CREATE INDEX idx_in_app_user_created ON public.in_app_notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.in_app_notifications TO authenticated;
GRANT ALL ON public.in_app_notifications TO service_role;
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ian read own" ON public.in_app_notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ian update own" ON public.in_app_notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5. Seed event catalog
INSERT INTO public.notification_events (event_key, label, description, category) VALUES
  ('sales_order.created',      'Sales Order Created',       'Triggered when a new sales order is created',      'sales'),
  ('purchase_order.approved',  'Purchase Order Approved',   'Triggered when a purchase order is approved',      'purchase'),
  ('invoice.generated',        'Invoice Generated',         'Triggered when a tax invoice is generated',        'accounting'),
  ('payment.received',         'Payment Received',          'Triggered when a customer payment is recorded',    'accounting'),
  ('dispatch.created',         'Dispatch Created',          'Triggered when a dispatch is created/marked ready','production'),
  ('customer.registered',      'Customer Registration',     'Triggered when a new customer is registered',      'crm'),
  ('vendor.registered',        'Vendor Registration',       'Triggered when a new vendor is registered',        'crm')
ON CONFLICT (event_key) DO NOTHING;

-- 6. Seed channel rows (disabled by default; admin enables what they want)
INSERT INTO public.notification_event_channels (event_key, channel, is_enabled)
SELECT e.event_key, c.channel, false
FROM public.notification_events e
CROSS JOIN (VALUES ('whatsapp'),('sms'),('email'),('in_app')) c(channel)
ON CONFLICT DO NOTHING;

-- 7. Register in_app provider row
INSERT INTO public.notification_providers (channel, name, display_name, is_active, is_default, priority, config, secret_env_keys)
VALUES ('in_app','internal','In-App Inbox', true, true, 1, '{}'::jsonb, '[]'::jsonb)
ON CONFLICT (channel, name) DO UPDATE SET is_active = true, is_default = true;
