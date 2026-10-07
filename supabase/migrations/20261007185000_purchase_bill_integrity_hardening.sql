BEGIN;

-- Purchase bill numbers are supplier document references. Prevent the same
-- supplier invoice number from being entered twice in the same company.
-- Supplier-less draft bills remain allowed to coexist.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_bills_company_supplier_number_unique
  ON public.purchase_bills(company_id, supplier_id, bill_number)
  WHERE supplier_id IS NOT NULL;

-- Harden the atomic purchase-bill entry point:
-- * management/internal books cannot receive operational purchase bills;
-- * GST components must be either intra-state (CGST+SGST) or inter-state (IGST);
-- * each supplied tax component is normalized to 2 decimals before persistence.
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
  company_row public.companies%ROWTYPE;
  line jsonb;
  ids uuid[];
  material_count integer;
  subtotal numeric := 0;
  cgst numeric := round(COALESCE(p_cgst,0),2);
  sgst numeric := round(COALESCE(p_sgst,0),2);
  igst numeric := round(COALESCE(p_igst,0),2);
  tax numeric := 0;
  total numeric := 0;
  bill_id uuid;
BEGIN
  IF company IS NULL THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'production')
  ) THEN
    RAISE EXCEPTION 'Purchasing access required';
  END IF;

  SELECT *
  INTO company_row
  FROM public.companies
  WHERE id=company
    AND is_active=true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active company not found';
  END IF;

  IF company_row.code LIKE '%\_MGMT' ESCAPE '\\' THEN
    RAISE EXCEPTION 'Purchase bills cannot be created in management books';
  END IF;

  IF NULLIF(btrim(p_bill_number),'') IS NULL THEN
    RAISE EXCEPTION 'Bill number is required';
  END IF;

  IF p_bill_date IS NULL THEN
    RAISE EXCEPTION 'Bill date is required';
  END IF;

  IF p_lines IS NULL
     OR jsonb_typeof(p_lines)<>'array'
     OR jsonb_array_length(p_lines)=0
  THEN
    RAISE EXCEPTION 'At least one purchase line is required';
  END IF;

  IF jsonb_array_length(p_lines)>200 THEN
    RAISE EXCEPTION 'Too many purchase lines';
  END IF;

  IF cgst<0 OR sgst<0 OR igst<0 THEN
    RAISE EXCEPTION 'Tax cannot be negative';
  END IF;

  -- A purchase bill is either intra-state (CGST+SGST) or inter-state (IGST).
  IF igst>0 AND (cgst>0 OR sgst>0) THEN
    RAISE EXCEPTION 'IGST cannot be combined with CGST/SGST';
  END IF;

  IF (cgst>0 AND sgst=0) OR (sgst>0 AND cgst=0) THEN
    RAISE EXCEPTION 'CGST and SGST must be supplied together';
  END IF;

  tax := round(cgst+sgst+igst,2);

  IF p_supplier_id IS NOT NULL
     AND NOT EXISTS(
       SELECT 1
       FROM public.suppliers
       WHERE id=p_supplier_id
         AND company_id=company
         AND COALESCE(is_active,true)
     )
  THEN
    RAISE EXCEPTION 'Supplier is outside the active company or inactive';
  END IF;

  SELECT array_agg(DISTINCT (value->>'raw_material_id')::uuid)
  INTO ids
  FROM jsonb_array_elements(p_lines);

  SELECT count(*)
  INTO material_count
  FROM public.raw_materials
  WHERE company_id=company
    AND id=ANY(ids)
    AND COALESCE(is_active,true);

  IF material_count <> COALESCE(array_length(ids,1),0) THEN
    RAISE EXCEPTION 'One or more raw materials are outside the active company or inactive';
  END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF COALESCE((line->>'quantity')::numeric,0)<=0 THEN
      RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    IF COALESCE((line->>'unit_price')::numeric,0)<0 THEN
      RAISE EXCEPTION 'Unit price cannot be negative';
    END IF;

    subtotal := subtotal + round(
      (line->>'quantity')::numeric * (line->>'unit_price')::numeric,2
    );
  END LOOP;

  total := round(subtotal+tax,2);

  IF p_supplier_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.purchase_bills
    WHERE company_id=company
      AND supplier_id=p_supplier_id
      AND bill_number=btrim(p_bill_number)
  ) THEN
    RAISE EXCEPTION 'A purchase bill with this supplier invoice number already exists in the active company';
  END IF;

  IF total<=0 THEN
    RAISE EXCEPTION 'Purchase bill total must be greater than zero';
  END IF;

  INSERT INTO public.purchase_bills(
    company_id,bill_number,supplier_id,bill_date,
    subtotal,tax_amount,cgst_amount,sgst_amount,igst_amount,
    total_amount,notes,created_by
  )
  VALUES(
    company,btrim(p_bill_number),p_supplier_id,p_bill_date,
    round(subtotal,2),tax,cgst,sgst,igst,total,
    NULLIF(btrim(p_notes),''),auth.uid()
  )
  RETURNING id INTO bill_id;

  INSERT INTO public.purchase_bill_items(
    company_id,purchase_bill_id,raw_material_id,quantity,unit_price
  )
  SELECT
    company,
    bill_id,
    (value->>'raw_material_id')::uuid,
    (value->>'quantity')::numeric,
    (value->>'unit_price')::numeric
  FROM jsonb_array_elements(p_lines);

  RETURN bill_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_purchase_bill_atomic(text,uuid,date,text,numeric,numeric,numeric,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_bill_atomic(text,uuid,date,text,numeric,numeric,numeric,jsonb)
  TO authenticated;

COMMIT;
