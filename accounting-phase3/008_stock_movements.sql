-- PREPARED ONLY. These functions are not installed automatically.
-- Inventory authority is stock_movements. raw_materials.current_stock is never changed.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idempotency_key_unique
  ON public.stock_movements (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.produce_sales_order_bom(p_order uuid,p_godown uuid,p_idempotency text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE def_g uuid; item record; bom record; stock_item uuid; qty numeric; n integer:=0; k text;
BEGIN
  IF p_order IS NULL OR p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'production order and idempotency key required'; END IF;
  SELECT COALESCE(p_godown,(SELECT default_godown_id FROM public.stock_valuation_settings LIMIT 1)) INTO def_g;
  IF def_g IS NULL THEN RAISE EXCEPTION 'default production godown required'; END IF;
  FOR item IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
    FOR bom IN SELECT raw_material_id,quantity_per_unit FROM public.model_boq WHERE model_id=item.model_id LOOP
      IF bom.quantity_per_unit<=0 THEN RAISE EXCEPTION 'invalid BOM quantity'; END IF;
      SELECT id INTO stock_item FROM public.stock_items WHERE mapped_raw_material_id=bom.raw_material_id AND is_active LIMIT 1;
      IF stock_item IS NULL THEN RAISE EXCEPTION 'no stock item mapped to BOM raw material'; END IF;
      qty:=bom.quantity_per_unit*item.quantity;
      k:=p_idempotency||':'||item.id::text||':'||bom.raw_material_id::text;
      PERFORM public.post_stock_issue(stock_item,def_g,qty,CURRENT_DATE,k,'sales_order_bom',p_order,'production_out');
      n:=n+1;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.receive_sales_order_finished_goods(p_order uuid,p_godown uuid,p_idempotency text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE def_g uuid; item record; stock_item uuid; rate numeric; n integer:=0; k text;
BEGIN
  IF p_order IS NULL OR p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'order and idempotency key required'; END IF;
  SELECT COALESCE(p_godown,(SELECT default_godown_id FROM public.stock_valuation_settings LIMIT 1)) INTO def_g;
  IF def_g IS NULL THEN RAISE EXCEPTION 'default finished-goods godown required'; END IF;
  FOR item IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
    SELECT id,standard_cost INTO stock_item,rate FROM public.stock_items WHERE mapped_model_id=item.model_id AND is_active LIMIT 1;
    IF stock_item IS NULL THEN RAISE EXCEPTION 'finished product has no stock item mapping'; END IF;
    IF COALESCE(rate,0)<=0 THEN RAISE EXCEPTION 'finished product has no valuation rate'; END IF;
    k:=p_idempotency||':'||item.id::text;
    PERFORM public.post_stock_receipt(stock_item,def_g,item.quantity,rate,CURRENT_DATE,k,'production');
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_sales_order(p_order uuid,p_godown uuid,p_idempotency text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE def_g uuid; item record; stock_item uuid; n integer:=0; k text;
BEGIN
  IF p_order IS NULL OR p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'order and idempotency key required'; END IF;
  SELECT COALESCE(p_godown,(SELECT default_godown_id FROM public.stock_valuation_settings LIMIT 1)) INTO def_g;
  IF def_g IS NULL THEN RAISE EXCEPTION 'default dispatch godown required'; END IF;
  FOR item IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
    SELECT id INTO stock_item FROM public.stock_items WHERE mapped_model_id=item.model_id AND is_active LIMIT 1;
    IF stock_item IS NULL THEN RAISE EXCEPTION 'finished product has no stock item mapping'; END IF;
    k:=p_idempotency||':'||item.id::text;
    PERFORM public.post_stock_issue(stock_item,def_g,item.quantity,CURRENT_DATE,k,'sales_order_dispatch',p_order,'sale');
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;
