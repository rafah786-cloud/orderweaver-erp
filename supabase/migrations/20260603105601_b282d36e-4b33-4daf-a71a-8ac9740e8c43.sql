
ALTER VIEW public.stock_summary SET (security_invoker = on);
ALTER VIEW public.stock_godown_summary SET (security_invoker = on);
REVOKE EXECUTE ON FUNCTION public.post_purchase_item_to_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_sales_item_to_movement() FROM PUBLIC, anon, authenticated;
