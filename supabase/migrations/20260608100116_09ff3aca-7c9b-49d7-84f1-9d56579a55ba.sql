
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS transporter_name text;

INSERT INTO public.whatsapp_templates (template_name, event_key, description, language_code, variables, is_active)
VALUES (
  'ORDER_DISPATCHED',
  'dispatch.update',
  'Sent to customer when an order is marked Ready For Dispatch or Dispatched',
  'en',
  '["customer_name","order_no","tracking_no","transporter_name"]'::jsonb,
  true
)
ON CONFLICT (template_name) DO UPDATE SET
  event_key = EXCLUDED.event_key,
  description = EXCLUDED.description,
  language_code = EXCLUDED.language_code,
  variables = EXCLUDED.variables,
  is_active = true,
  updated_at = now();
