INSERT INTO public.whatsapp_templates (template_name, language_code, event_key, variables, is_active)
VALUES ('PAYMENT_RECEIVED', 'en', 'payment.received', '["customer_name","receipt_no","payment_amount"]'::jsonb, true)
ON CONFLICT (template_name) DO UPDATE
SET event_key = EXCLUDED.event_key,
    variables = EXCLUDED.variables,
    is_active = true,
    language_code = EXCLUDED.language_code;