
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS customer_code text,
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT true;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS vendor_code text;

ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text,
  ADD COLUMN IF NOT EXISTS read_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON public.notification_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_party ON public.notification_log (party_kind, party_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_msgid ON public.notification_log (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL UNIQUE,
  event_key text NOT NULL,
  description text,
  language_code text NOT NULL DEFAULT 'en',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wat_read_staff" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales')
    OR public.has_role(auth.uid(), 'production') OR public.has_role(auth.uid(), 'accountant')
  );

CREATE POLICY "wat_write_admin" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER wat_touch BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
