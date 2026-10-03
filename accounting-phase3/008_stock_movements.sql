-- PREPARED ONLY. NOT INSTALLED IN PRODUCTION.
-- Inventory authority is stock_movements. These functions never update raw_materials.current_stock.
-- Issues/transfers lock the stock item row so concurrent postings serialize.
-- Opening movements remain untouched and unrated.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idempotency_key_unique
  ON public.stock_movements (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.post_stock_receipt(
  p_item uuid,
  p_godown uuid,
  p_qty numeric,
  p_rate numeric,
  p_date date,
  p_key text,
  p_source text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing uuid;
  movement uuid;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN RAISE EXCEPTION 'idempotency key required'; END IF;
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key = p_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  PERFORM 1 FROM public.stock_items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stock item not found'; END IF;
  IF p_godown IS NULL THEN RAISE EXCEPTION 'godown required'; END IF;
  IF p_qty <= 0 OR p_rate <= 0 THEN RAISE EXCEPTION 'invalid receipt'; END IF;

  INSERT INTO public.stock_movements
    (stock_item_id, godown_id, movement_type, quantity, rate, amount, movement_date, source_table, idempotency_key)
  VALUES
    (p_item, p_godown, 'purchase', p_qty, p_rate, round(p_qty * p_rate, 2), p_date, p_source, p_key)
  RETURNING id INTO movement;
  RETURN movement;
END $$;

CREATE OR REPLACE FUNCTION public.post_stock_issue(
  p_item uuid,
  p_godown uuid,
  p_qty numeric,
  p_date date,
  p_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing uuid;
  available numeric;
  movement uuid;
  avg_rate numeric;
  on_hand_value numeric;
  on_hand_qty numeric;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN RAISE EXCEPTION 'idempotency key required'; END IF;
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key = p_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  PERFORM 1 FROM public.stock_items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stock item not found'; END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'invalid issue'; END IF;

  SELECT COALESCE(sum(
    CASE
      WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity
      WHEN movement_type IN ('purchase','transfer_in','production_in','opening') THEN quantity
      ELSE quantity
    END
  ), 0)
  INTO available
  FROM public.stock_movements
  WHERE stock_item_id = p_item AND godown_id = p_godown;

  IF available < p_qty THEN RAISE EXCEPTION 'insufficient stock'; END IF;

  -- Calculate running weighted average from the signed inventory balance.
  -- Do not divide total positive movement value by total positive movement quantity:
  -- issue rows must reduce both value and quantity.
  SELECT
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -amount ELSE amount END), 0),
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END), 0)
  INTO on_hand_value, on_hand_qty
  FROM public.stock_movements
  WHERE stock_item_id = p_item AND godown_id = p_godown;

  IF on_hand_qty <= 0 OR on_hand_value <= 0 THEN RAISE EXCEPTION 'stock has no rated value'; END IF;
  avg_rate := on_hand_value / on_hand_qty;
  IF avg_rate <= 0 THEN RAISE EXCEPTION 'stock has no rated value'; END IF;

  INSERT INTO public.stock_movements
    (stock_item_id, godown_id, movement_type, quantity, rate, amount, movement_date, idempotency_key)
  VALUES
    (p_item, p_godown, 'sale', p_qty, avg_rate, round(p_qty * avg_rate, 2), p_date, p_key)
  RETURNING id INTO movement;
  RETURN movement;
END $$;

CREATE OR REPLACE FUNCTION public.post_stock_transfer(
  p_item uuid,
  p_from_godown uuid,
  p_to_godown uuid,
  p_qty numeric,
  p_date date,
  p_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing uuid;
  out_id uuid;
  in_id uuid;
  from_available numeric;
  from_value numeric;
  from_qty numeric;
  rate numeric;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN RAISE EXCEPTION 'idempotency key required'; END IF;
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key = p_key LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_from_godown IS NULL OR p_to_godown IS NULL OR p_from_godown = p_to_godown THEN RAISE EXCEPTION 'invalid godown transfer'; END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'invalid transfer'; END IF;

  -- Lock the item row first; both godown balances therefore serialize on the same item.
  PERFORM 1 FROM public.stock_items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stock item not found'; END IF;

  SELECT COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END), 0)
  INTO from_available
  FROM public.stock_movements
  WHERE stock_item_id = p_item AND godown_id = p_from_godown;
  IF from_available < p_qty THEN RAISE EXCEPTION 'insufficient stock'; END IF;

  SELECT
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -amount ELSE amount END), 0),
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END), 0)
  INTO from_value, from_qty
  FROM public.stock_movements
  WHERE stock_item_id = p_item AND godown_id = p_from_godown;
  IF from_qty <= 0 OR from_value <= 0 THEN RAISE EXCEPTION 'source stock has no rated value'; END IF;
  rate := from_value / from_qty;

  INSERT INTO public.stock_movements
    (stock_item_id, godown_id, movement_type, quantity, rate, amount, movement_date, source_table, idempotency_key)
  VALUES (p_item, p_from_godown, 'transfer_out', p_qty, rate, round(p_qty * rate, 2), p_date, 'stock_transfer', p_key)
  RETURNING id INTO out_id;

  INSERT INTO public.stock_movements
    (stock_item_id, godown_id, movement_type, quantity, rate, amount, movement_date, source_table, idempotency_key)
  VALUES (p_item, p_to_godown, 'transfer_in', p_qty, rate, round(p_qty * rate, 2), p_date, 'stock_transfer', p_key)
  RETURNING id INTO in_id;

  RETURN out_id;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_stock_movement(
  p_movement uuid,
  p_date date,
  p_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing uuid;
  original record;
  movement uuid;
  opposite text;
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN RAISE EXCEPTION 'idempotency key required'; END IF;
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key = p_key LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  SELECT * INTO original FROM public.stock_movements WHERE id = p_movement FOR UPDATE;
  IF original.id IS NULL THEN RAISE EXCEPTION 'movement not found'; END IF;
  IF original.movement_type = 'opening' THEN RAISE EXCEPTION 'opening movement cannot be reversed'; END IF;

  PERFORM 1 FROM public.stock_items WHERE id = original.stock_item_id FOR UPDATE;
  opposite := CASE original.movement_type
    WHEN 'purchase' THEN 'sale'
    WHEN 'sale' THEN 'purchase'
    WHEN 'transfer_in' THEN 'transfer_out'
    WHEN 'transfer_out' THEN 'transfer_in'
    WHEN 'production_in' THEN 'production_out'
    WHEN 'production_out' THEN 'production_in'
    ELSE NULL
  END;
  IF opposite IS NULL THEN RAISE EXCEPTION 'movement type cannot be reversed'; END IF;

  INSERT INTO public.stock_movements
    (stock_item_id, godown_id, movement_type, quantity, rate, amount, movement_date, source_table, idempotency_key, reverses_posting_id)
  VALUES
    (original.stock_item_id, original.godown_id, opposite, original.quantity, original.rate, original.amount, p_date, 'stock_reversal', p_key, original.posting_id)
  RETURNING id INTO movement;
  RETURN movement;
END $$;

-- Explicit execute grants are intentionally prepared here but this file is NOT installed.
REVOKE ALL ON FUNCTION public.post_stock_receipt(uuid,uuid,numeric,numeric,date,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_stock_issue(uuid,uuid,numeric,date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_stock_transfer(uuid,uuid,uuid,numeric,date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_stock_movement(uuid,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_stock_receipt(uuid,uuid,numeric,numeric,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_issue(uuid,uuid,numeric,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_transfer(uuid,uuid,uuid,numeric,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_stock_movement(uuid,date,text) TO authenticated;
