-- Enforce company boundaries inside SECURITY DEFINER stock posting functions.
-- These functions must never be able to resolve a stock item/godown from another company.

CREATE OR REPLACE FUNCTION public.post_stock_receipt(
  p_item uuid,p_godown uuid,p_qty numeric,p_rate numeric,p_date date,p_key text,
  p_source text DEFAULT NULL,p_source_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  existing uuid;
  movement uuid;
  company uuid := public.current_company_id();
BEGIN
  IF company IS NULL THEN RAISE EXCEPTION 'No active company selected'; END IF;
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'accountant') OR
    public.has_role(auth.uid(),'production')
  ) THEN RAISE EXCEPTION 'Inventory access required'; END IF;
  IF p_key IS NULL OR btrim(p_key)='' THEN RAISE EXCEPTION 'Idempotency key required'; END IF;

  SELECT id INTO existing
  FROM public.stock_movements
  WHERE company_id=company AND idempotency_key=p_key
  LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  IF p_qty<=0 OR p_rate<=0 THEN RAISE EXCEPTION 'Receipt quantity and rate must be positive'; END IF;

  PERFORM 1
  FROM public.stock_items
  WHERE id=p_item AND company_id=company AND COALESCE(is_active,true)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active stock item not found in active company'; END IF;

  IF p_godown IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.godowns
    WHERE id=p_godown AND company_id=company
  ) THEN
    RAISE EXCEPTION 'Godown not found in active company';
  END IF;

  INSERT INTO public.stock_movements(
    stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,
    source_table,source_id,idempotency_key,created_by,company_id
  )
  VALUES(
    p_item,p_godown,'purchase',p_qty,p_rate,round(p_qty*p_rate,2),
    COALESCE(p_date,CURRENT_DATE),p_source,p_source_id,p_key,auth.uid(),company
  )
  RETURNING id INTO movement;

  RETURN movement;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_stock_issue(
  p_item uuid,p_godown uuid,p_qty numeric,p_date date,p_key text,
  p_source text DEFAULT NULL,p_source_id uuid DEFAULT NULL,
  p_movement_type public.stock_movement_type DEFAULT 'sale'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  existing uuid;
  movement uuid;
  available numeric;
  on_hand_qty numeric;
  on_hand_value numeric;
  avg_rate numeric;
  allow_neg boolean;
  company uuid := public.current_company_id();
BEGIN
  IF company IS NULL THEN RAISE EXCEPTION 'No active company selected'; END IF;
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'accountant') OR
    public.has_role(auth.uid(),'production')
  ) THEN RAISE EXCEPTION 'Inventory access required'; END IF;
  IF p_key IS NULL OR btrim(p_key)='' THEN RAISE EXCEPTION 'Idempotency key required'; END IF;

  SELECT id INTO existing
  FROM public.stock_movements
  WHERE company_id=company AND idempotency_key=p_key
  LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  IF p_qty<=0 THEN RAISE EXCEPTION 'Issue quantity must be positive'; END IF;
  IF p_movement_type NOT IN ('sale','production_out','transfer_out','adjustment') THEN
    RAISE EXCEPTION 'Invalid issue movement type';
  END IF;

  PERFORM 1
  FROM public.stock_items
  WHERE id=p_item AND company_id=company AND COALESCE(is_active,true)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active stock item not found in active company'; END IF;

  IF p_godown IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.godowns
    WHERE id=p_godown AND company_id=company
  ) THEN
    RAISE EXCEPTION 'Godown not found in active company';
  END IF;

  SELECT
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out')
      THEN -quantity ELSE quantity END),0),
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out')
      THEN -amount ELSE amount END),0)
  INTO available,on_hand_value
  FROM public.stock_movements
  WHERE company_id=company AND stock_item_id=p_item AND godown_id=p_godown;

  on_hand_qty := available;

  SELECT COALESCE((
    SELECT allow_negative_stock
    FROM public.stock_valuation_settings
    WHERE company_id=company
    LIMIT 1
  ),false) INTO allow_neg;

  IF NOT allow_neg AND available<p_qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
  IF on_hand_qty<=0 OR on_hand_value<=0 THEN RAISE EXCEPTION 'Stock has no rated value'; END IF;

  avg_rate:=on_hand_value/on_hand_qty;

  INSERT INTO public.stock_movements(
    stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,
    source_table,source_id,idempotency_key,created_by,company_id
  )
  VALUES(
    p_item,p_godown,p_movement_type,p_qty,avg_rate,round(p_qty*avg_rate,2),
    COALESCE(p_date,CURRENT_DATE),p_source,p_source_id,p_key,auth.uid(),company
  )
  RETURNING id INTO movement;

  RETURN movement;
END;
$function$;

REVOKE ALL ON FUNCTION public.post_stock_receipt(uuid,uuid,numeric,numeric,date,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.post_stock_issue(uuid,uuid,numeric,date,text,text,uuid,public.stock_movement_type) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_receipt(uuid,uuid,numeric,numeric,date,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_issue(uuid,uuid,numeric,date,text,text,uuid,public.stock_movement_type) TO authenticated;
