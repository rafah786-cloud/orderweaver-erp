-- Production hardening: align the enterprise foundation with the existing currencies master and remove the legacy sales-order stock side effect.
ALTER TABLE public.rfqs ADD COLUMN IF NOT EXISTS currency_code text;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS currency_code text;
DROP TRIGGER IF EXISTS trg_sales_item_movement ON public.sales_order_items;
