
CREATE TABLE IF NOT EXISTS public.notification_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms','email','push')),
  name text NOT NULL,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 100,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_env_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_providers_one_default_per_channel
  ON public.notification_providers (channel) WHERE is_default = true;

GRANT SELECT ON public.notification_providers TO authenticated;
GRANT ALL ON public.notification_providers TO service_role;

ALTER TABLE public.notification_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "np read staff" ON public.notification_providers FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
    OR public.has_role(auth.uid(),'production') OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'hr')
  );
CREATE POLICY "np admin manage" ON public.notification_providers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_notification_providers_updated_at
  BEFORE UPDATE ON public.notification_providers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.notification_providers (channel, name, display_name, is_active, is_default, priority, config, secret_env_keys, notes)
VALUES
  ('whatsapp','interakt','Interakt (WhatsApp Business API)', false, true, 10,
    '{"base_url":"https://api.interakt.ai/v1/public","default_language":"en"}'::jsonb,
    '["INTERAKT_API_KEY","INTERAKT_WEBHOOK_SECRET"]'::jsonb,
    'Set INTERAKT_API_KEY and INTERAKT_WEBHOOK_SECRET to activate.'),
  ('sms','stub','SMS (not configured)', false, true, 100, '{}'::jsonb, '[]'::jsonb, 'Add a real SMS provider (Twilio, MSG91, Gupshup) here.'),
  ('email','stub','Email (not configured)', false, true, 100, '{}'::jsonb, '[]'::jsonb, 'Add a real Email provider (Resend, SES, Sendgrid) here.'),
  ('push','stub','Push (not configured)', false, true, 100, '{}'::jsonb, '[]'::jsonb, 'Add a real Push provider (FCM, OneSignal) here.')
ON CONFLICT (channel, name) DO NOTHING;
