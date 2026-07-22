
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS promo_opt_in boolean NOT NULL DEFAULT true;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS promo_opt_in boolean NOT NULL DEFAULT true;
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS body_template text;
