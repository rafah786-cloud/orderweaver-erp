-- PREPARED ONLY. Inventory authority is stock_movements. These functions never update raw_materials.current_stock.
-- Opening movements remain untouched and unrated.

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idempotency_key_unique ON public.stock_movements (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.post_stock_receipt(p_item uuid,p_godown uuid,p_qty numeric,p_rate numeric,p_date date,p_key text,p_source text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid; movement uuid;
BEGIN
 IF p_key IS NULL OR btrim(p_key)='' THEN RAISE EXCEPTION 'idempotency key required'; END IF;
 SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key=p_key; IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF p_qty<=0 OR p_rate<=0 THEN RAISE EXCEPTION 'invalid receipt'; END IF;
 PERFORM 1 FROM public.stock_items WHERE id=p_item FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'stock item not found'; END IF;
 IF p_godown IS NULL THEN RAISE EXCEPTION 'godown required'; END IF;
 INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,idempotency_key)
 VALUES(p_item,p_godown,'purchase',p_qty,p_rate,round(p_qty*p_rate,2),p_date,p_source,p_key) RETURNING id INTO movement;
 RETURN movement;
END $$;

CREATE OR REPLACE FUNCTION public.post_stock_issue(p_item uuid,p_godown uuid,p_qty numeric,p_date date,p_key text,p_source text DEFAULT NULL,p_source_id uuid DEFAULT NULL,p_movement_type text DEFAULT 'sale')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid; movement uuid; available numeric; on_hand_value numeric; on_hand_qty numeric; avg_rate numeric; allow_neg boolean;
BEGIN
 IF p_key IS NULL OR btrim(p_key)='' THEN RAISE EXCEPTION 'idempotency key required'; END IF;
 SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key=p_key; IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF p_qty<=0 THEN RAISE EXCEPTION 'invalid issue'; END IF;
 PERFORM 1 FROM public.stock_items WHERE id=p_item FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'stock item not found'; END IF;
 SELECT COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END),0) INTO available FROM public.stock_movements WHERE stock_item_id=p_item AND godown_id=p_godown;
 SELECT COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -amount ELSE amount END),0),COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END),0) INTO on_hand_value,on_hand_qty FROM public.stock_movements WHERE stock_item_id=p_item AND godown_id=p_godown;
 SELECT COALESCE((SELECT allow_negative_stock FROM public.stock_valuation_settings LIMIT 1),false) INTO allow_neg;
 IF NOT allow_neg AND available<p_qty THEN RAISE EXCEPTION 'insufficient stock'; END IF;
 IF on_hand_qty<=0 OR on_hand_value<=0 THEN RAISE EXCEPTION 'stock has no rated value'; END IF;
 avg_rate:=on_hand_value/on_hand_qty;
 INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,source_id,idempotency_key)
 VALUES(p_item,p_godown,p_movement_type,p_qty,avg_rate,round(p_qty*avg_rate,2),p_date,p_source,p_source_id,p_key) RETURNING id INTO movement;
 RETURN movement;
END $$;

CREATE OR REPLACE FUNCTION public.post_stock_transfer(p_item uuid,p_from_godown uuid,p_to_godown uuid,p_qty numeric,p_date date,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid; out_id uuid; from_available numeric; from_value numeric; from_qty numeric; rate numeric;
BEGIN
 SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key=p_key OR idempotency_key=p_key||':out' LIMIT 1; IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF p_from_godown IS NULL OR p_to_godown IS NULL OR p_from_godown=p_to_godown OR p_qty<=0 THEN RAISE EXCEPTION 'invalid godown transfer'; END IF;
 PERFORM 1 FROM public.stock_items WHERE id=p_item FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'stock item not found'; END IF;
 SELECT COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END),0),COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -amount ELSE amount END),0) INTO from_qty,from_value FROM public.stock_movements WHERE stock_item_id=p_item AND godown_id=p_from_godown;
 from_available:=from_qty; IF from_available<p_qty THEN RAISE EXCEPTION 'insufficient stock'; END IF;
 IF from_qty<=0 OR from_value<=0 THEN RAISE EXCEPTION 'source stock has no rated value'; END IF;
 rate:=from_value/from_qty;
 INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,idempotency_key) VALUES(p_item,p_from_godown,'transfer_out',p_qty,rate,round(p_qty*rate,2),p_date,'stock_transfer',p_key||':out') RETURNING id INTO out_id;
 INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,idempotency_key) VALUES(p_item,p_to_godown,'transfer_in',p_qty,rate,round(p_qty*rate,2),p_date,'stock_transfer',p_key||':in');
 RETURN out_id;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_stock_movement(p_movement uuid,p_date date,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid; original record; opposite text; movement uuid;
BEGIN
 SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key=p_key; IF existing IS NOT NULL THEN RETURN existing; END IF;
 SELECT * INTO original FROM public.stock_movements WHERE id=p_movement FOR UPDATE;
 IF original.id IS NULL OR original.movement_type='opening' THEN RAISE EXCEPTION 'movement cannot be reversed'; END IF;
 opposite:=CASE original.movement_type WHEN 'purchase' THEN 'sale' WHEN 'sale' THEN 'purchase' WHEN 'transfer_in' THEN 'transfer_out' WHEN 'transfer_out' THEN 'transfer_in' WHEN 'production_in' THEN 'production_out' WHEN 'production_out' THEN 'production_in' ELSE NULL END;
 IF opposite IS NULL THEN RAISE EXCEPTION 'movement type cannot be reversed'; END IF;
 PERFORM 1 FROM public.stock_items WHERE id=original.stock_item_id FOR UPDATE;
 INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,source_id,idempotency_key,reverses_posting_id)
 VALUES(original.stock_item_id,original.godown_id,opposite,original.quantity,original.rate,original.amount,p_date,'stock_reversal',original.source_id,p_key,original.id) RETURNING id INTO movement;
 RETURN movement;
END $$;

CREATE OR REPLACE FUNCTION public.produce_sales_order_bom(p_order uuid,p_godown uuid,p_idempotency text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE def_g uuid; item record; bom record; stock_item uuid; qty numeric; n integer:=0; k text;
BEGIN
 IF p_order IS NULL OR p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'production order and idempotency key required'; END IF;
 SELECT COALESCE(p_godown,(SELECT default_godown_id FROM public.stock_valuation_settings LIMIT 1)) INTO def_g; IF def_g IS NULL THEN RAISE EXCEPTION 'default production godown required'; END IF;
 FOR item IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
  FOR bom IN SELECT raw_material_id,quantity_per_unit FROM public.model_boq WHERE model_id=item.model_id LOOP
   IF bom.quantity_per_unit<=0 THEN RAISE EXCEPTION 'invalid BOM quantity'; END IF;
   SELECT id INTO stock_item FROM public.stock_items WHERE mapped_raw_material_id=bom.raw_material_id AND is_active LIMIT 1; IF stock_item IS NULL THEN RAISE EXCEPTION 'no stock item mapped to BOM raw material'; END IF;
   qty:=bom.quantity_per_unit*item.quantity; k:=p_idempotency||':'||item.id::text||':'||bom.raw_material_id::text;
   PERFORM public.post_stock_issue(stock_item,def_g,qty,CURRENT_DATE,k,'sales_order_bom',p_order,'production_out'); n:=n+1;
  END LOOP;
 END LOOP; RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.receive_sales_order_finished_goods(p_order uuid,p_godown uuid,p_idempotency text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE def_g uuid; item record; stock_item uuid; rate numeric; n integer:=0; k text;
BEGIN
 IF p_order IS NULL OR p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'order and idempotency key required'; END IF;
 SELECT COALESCE(p_godown,(SELECT default_godown_id FROM public.stock_valuation_settings LIMIT 1)) INTO def_g; IF def_g IS NULL THEN RAISE EXCEPTION 'default finished-goods godown required'; END IF;
 FOR item IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
  SELECT id,standard_cost INTO stock_item,rate FROM public.stock_items WHERE mapped_model_id=item.model_id AND is_active LIMIT 1;
  IF stock_item IS NULL THEN RAISE EXCEPTION 'finished product has no stock item mapping'; END IF;
  IF COALESCE(rate,0)<=0 THEN RAISE EXCEPTION 'finished product has no valuation rate'; END IF;
  k:=p_idempotency||':'||item.id::text; PERFORM public.post_stock_receipt(stock_item,def_g,item.quantity,rate,CURRENT_DATE,k,'production'); n:=n+1;
 END LOOP; RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_sales_order(p_order uuid,p_godown uuid,p_idempotency text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE def_g uuid; item record; stock_item uuid; n integer:=0; k text;
BEGIN
 IF p_order IS NULL OR p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'order and idempotency key required'; END IF;
 SELECT COALESCE(p_godown,(SELECT default_godown_id FROM public.stock_valuation_settings LIMIT 1)) INTO def_g; IF def_g IS NULL THEN RAISE EXCEPTION 'default dispatch godown required'; END IF;
 FOR item IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
  SELECT id INTO stock_item FROM public.stock_items WHERE mapped_model_id=item.model_id AND is_active LIMIT 1; IF stock_item IS NULL THEN RAISE EXCEPTION 'finished product has no stock item mapping'; END IF;
  k:=p_idempotency||':'||item.id::text; PERFORM public.post_stock_issue(stock_item,def_g,item.quantity,CURRENT_DATE,k,'sales_order_dispatch',p_order,'sale'); n:=n+1;
 END LOOP; RETURN n;
END $$;
