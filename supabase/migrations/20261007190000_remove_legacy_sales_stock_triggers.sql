-- Remove obsolete sales-order stock triggers.
-- Stock is now posted only by the canonical production/dispatch posting engine.
-- The legacy triggers could deduct raw-material stock when an order line was created,
-- causing stock to move before production and potentially double-post later.

DROP TRIGGER IF EXISTS trg_sales_item_movement ON public.sales_order_items;
DROP TRIGGER IF EXISTS soi_stock_out ON public.sales_order_items;
