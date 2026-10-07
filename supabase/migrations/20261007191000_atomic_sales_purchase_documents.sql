-- Atomic document creation for sales orders and purchase bills.
-- Prevents orphan headers/lines and makes client retries safe.

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS creation_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_creation_idempotency_unique
  ON public.sales_orders(company_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_sales_order_atomic(
  p_party_id uuid,
  p_order_date date,
  p_expected_delivery date,
  p_notes text,
  p_idempotency_key text,
  p_lines jsonb
)
RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  company uuid := public.current_company_id();
  party_exists boolean;
  line jsonb;
  model_ids uuid[];
  model_count integer;
  total numeric := 0;
  order_id uuid;
  next_no bigint;
  order_no text;
BEGIN
  IF company IS NULL THEN RAISE EXCEPTION 'No active company selected'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales'))
    THEN RAISE EXCEPTION 'Sales access required'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8
    THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0
    THEN RAISE EXCEPTION 'At least one sales-order line is required'; END IF;
  IF jsonb_array_length(p_lines)>200 THEN RAISE EXCEPTION 'Too many sales-order lines'; END IF;

  SELECT id INTO order_id
  FROM public.sales_orders
  WHERE company_id=company AND creation_idempotency_key=p_idempotency_key
  LIMIT 1;
  IF order_id IS NOT NULL THEN
    RETURN QUERY SELECT so.id,so.order_number FROM public.sales_orders so WHERE so.id=order_id;
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.parties
    WHERE id=p_party_id AND company_id=company
  ) INTO party_exists;
  IF NOT party_exists THEN RAISE EXCEPTION 'Party is outside the active company'; END IF;

  SELECT array_agg(DISTINCT (value->>'model_id')::uuid)
  INTO model_ids
  FROM jsonb_array_elements(p_lines);

  SELECT count(*) INTO model_count
  FROM public.product_models
  WHERE company_id=company AND id=ANY(model_ids);
  IF model_count <> COALESCE(array_length(model_ids,1),0)
    THEN RAISE EXCEPTION 'One or more product models are outside the active company'; END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF NULLIF(btrim(line->>'product_name'),'') IS NULL THEN RAISE EXCEPTION 'Product name is required'; END IF;
    IF COALESCE((line->>'quantity')::numeric,0)<=0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
    IF COALESCE((line->>'unit_price')::numeric,0)<0 THEN RAISE EXCEPTION 'Unit price cannot be negative'; END IF;
    total := total + round((line->>'quantity')::numeric*(line->>'unit_price')::numeric,2);
  END LOOP;
  IF total<=0 THEN RAISE EXCEPTION 'Order total must be greater than zero'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sales-order-number:'||company::text,0));

  SELECT COALESCE(
    max(NULLIF(regexp_replace(order_number,'[^0-9]','','g'),'')::bigint),0
  ) + 1 INTO next_no
  FROM public.sales_orders
  WHERE company_id=company;
  order_no := 'SO-'||lpad(next_no::text,8,'0');

  INSERT INTO public.sales_orders(
    company_id,order_number,party_id,order_date,expected_delivery,total_amount,notes,created_by,creation_idempotency_key
  ) VALUES(
    company,order_no,p_party_id,p_order_date,p_expected_delivery,round(total,2),NULLIF(p_notes,''),auth.uid(),p_idempotency_key
  )
  RETURNING public.sales_orders.id INTO order_id;

  INSERT INTO public.sales_order_items(
    company_id,sales_order_id,model_id,product_name,size,quantity,unit_price
  )
  SELECT
    company,(order_id),(value->>'model_id')::uuid,btrim(value->>'product_name'),
    NULLIF(btrim(value->>'size'),''),(value->>'quantity')::numeric,(value->>'unit_price')::numeric
  FROM jsonb_array_elements(p_lines);

  RETURN QUERY SELECT order_id,order_no;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_sales_order_atomic(uuid,date,date,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order_atomic(uuid,date,date,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_purchase_bill_atomic(
  p_bill_number text,
  p_supplier_id uuid,
  p_bill_date date,
  p_notes text,
  p_cgst numeric,
  p_sgst numeric,
  p_igst numeric,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  company uuid := public.current_company_id();
  line jsonb;
  ids uuid[];
  material_count integer;
  subtotal numeric := 0;
  tax numeric := 0;
  total numeric := 0;
  bill_id uuid;
BEGIN
  IF company IS NULL THEN RAISE EXCEPTION 'No active company selected'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'production'))
    THEN RAISE EXCEPTION 'Purchasing access required'; END IF;
  IF NULLIF(btrim(p_bill_number),'') IS NULL THEN RAISE EXCEPTION 'Bill number is required'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0
    THEN RAISE EXCEPTION 'At least one purchase line is required'; END IF;
  IF jsonb_array_length(p_lines)>200 THEN RAISE EXCEPTION 'Too many purchase lines'; END IF;
  IF p_cgst<0 OR p_sgst<0 OR p_igst<0 THEN RAISE EXCEPTION 'Tax cannot be negative'; END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND company_id=company
  ) THEN RAISE EXCEPTION 'Supplier is outside the active company'; END IF;

  SELECT array_agg(DISTINCT (value->>'raw_material_id')::uuid)
  INTO ids
  FROM jsonb_array_elements(p_lines);
  SELECT count(*) INTO material_count
  FROM public.raw_materials
  WHERE company_id=company AND id=ANY(ids);
  IF material_count <> COALESCE(array_length(ids,1),0)
    THEN RAISE EXCEPTION 'One or more raw materials are outside the active company'; END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF COALESCE((line->>'quantity')::numeric,0)<=0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
    IF COALESCE((line->>'unit_price')::numeric,0)<0 THEN RAISE EXCEPTION 'Unit price cannot be negative'; END IF;
    subtotal := subtotal + round((line->>'quantity')::numeric*(line->>'unit_price')::numeric,2);
  END LOOP;

  tax := round(p_cgst+p_sgst+p_igst,2);
  total := round(subtotal+tax,2);
  IF total<=0 THEN RAISE EXCEPTION 'Purchase bill total must be greater than zero'; END IF;

  INSERT INTO public.purchase_bills(
    company_id,bill_number,supplier_id,bill_date,subtotal,tax_amount,cgst_amount,sgst_amount,igst_amount,total_amount,notes,created_by
  ) VALUES(
    company,p_bill_number,p_supplier_id,p_bill_date,round(subtotal,2),tax,round(p_cgst,2),round(p_sgst,2),round(p_igst,2),total,NULLIF(p_notes,''),auth.uid()
  )
  RETURNING public.purchase_bills.id INTO bill_id;

  INSERT INTO public.purchase_bill_items(
    company_id,purchase_bill_id,raw_material_id,quantity,unit_price
  )
  SELECT
    company,bill_id,(value->>'raw_material_id')::uuid,(value->>'quantity')::numeric,(value->>'unit_price')::numeric
  FROM jsonb_array_elements(p_lines);

  RETURN bill_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_purchase_bill_atomic(text,uuid,date,text,numeric,numeric,numeric,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_bill_atomic(text,uuid,date,text,numeric,numeric,numeric,jsonb) TO authenticated;
