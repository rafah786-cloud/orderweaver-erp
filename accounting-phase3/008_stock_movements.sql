-- NOT INSTALLED. Inserts stock_movements only. Does not update raw_materials.current_stock
-- and does not update existing opening movements.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idempotency_key_unique
  ON public.stock_movements (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.post_stock_receipt(
  p_item uuid, p_godown uuid, p_qty numeric, p_rate numeric, p_date date, p_key text, p_source text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing uuid; movement uuid;
BEGIN
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key = p_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_qty <= 0 OR p_rate <= 0 THEN RAISE EXCEPTION 'invalid receipt'; END IF;
  INSERT INTO public.stock_movements (stock_item_id, godown_id, movement_type, quantity, rate, amount, movement_date, source_table, idempotency_key)
  VALUES (p_item, p_godown, 'purchase', p_qty, p_rate, round(p_qty * p_rate, 2), p_date, p_source, p_key)
  RETURNING id INTO movement;
  RETURN movement;
END $$;

CREATE OR REPLACE FUNCTION public.post_stock_issue(
  p_item uuid, p_godown uuid, p_qty numeric, p_date date, p_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing uuid; available numeric; movement uuid; avg numeric;
BEGIN
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key = p_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  SELECT COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END), 0)
  INTO available FROM public.stock_movements WHERE stock_item_id = p_item AND godown_id = p_godown;
  IF available < p_qty THEN RAISE EXCEPTION 'insufficient stock'; END IF;
  SELECT sum(amount) / NULLIF(sum(quantity), 0) INTO avg
  FROM public.stock_movements WHERE stock_item_id = p_item AND godown_id = p_godown AND rate > 0;
  IF avg IS NULL THEN RAISE EXCEPTION 'opening stock has no rate'; END IF;
  INSERT INTO public.stock_movements (stock_item_id, godown_id, movement_type, quantity, rate, amount, movement_date, idempotency_key)
  VALUES (p_item, p_godown, 'sale', p_qty, avg, round(p_qty * avg, 2), p_date, p_key)
  RETURNING id INTO movement;
  RETURN movement;
END $$;

