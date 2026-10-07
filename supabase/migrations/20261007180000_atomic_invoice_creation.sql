-- Atomic invoice creation: validate everything before the canonical invoice trigger
-- posts accounting, then create header + lines in one database transaction.

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
  p_party_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_notes text,
  p_supply text,
  p_lines jsonb
)
RETURNS TABLE(id uuid, invoice_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  company uuid := public.current_company_id();
  company_row public.companies%ROWTYPE;
  party public.parties%ROWTYPE;
  line jsonb;
  invoice_id uuid;
  number_no bigint;
  number_text text;
  subtotal numeric := 0;
  tax numeric := 0;
  cgst numeric := 0;
  sgst numeric := 0;
  igst numeric := 0;
  line_amount numeric;
  line_tax numeric;
  total numeric;
  outstanding numeric := 0;
  credit_limit numeric;
  party_ledger uuid;
  sales_ledger uuid;
  tax_ledger_count integer;
BEGIN
  IF company IS NULL THEN
    RAISE EXCEPTION 'No active company selected';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales')
  ) THEN
    RAISE EXCEPTION 'Sales access required';
  END IF;

  SELECT * INTO company_row
  FROM public.companies
  WHERE id=company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active company not found';
  END IF;

  IF company_row.code LIKE '%\_MGMT' ESCAPE '\' THEN
    RAISE EXCEPTION 'Invoices cannot be created in management books';
  END IF;

  SELECT * INTO party
  FROM public.parties
  WHERE id=p_party_id AND company_id=company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Party is outside the active company';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 THEN
    RAISE EXCEPTION 'At least one invoice line is required';
  END IF;

  IF jsonb_array_length(p_lines)>200 THEN
    RAISE EXCEPTION 'Too many invoice lines';
  END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF NULLIF(btrim(line->>'description'),'') IS NULL THEN
      RAISE EXCEPTION 'Invoice line description is required';
    END IF;
    IF COALESCE((line->>'quantity')::numeric,0)<=0 THEN
      RAISE EXCEPTION 'Invoice line quantity must be positive';
    END IF;
    IF COALESCE((line->>'unit_price')::numeric,0)<0 THEN
      RAISE EXCEPTION 'Invoice line unit price cannot be negative';
    END IF;
    IF COALESCE((line->>'tax_rate')::numeric,0)<0 OR COALESCE((line->>'tax_rate')::numeric,0)>100 THEN
      RAISE EXCEPTION 'Invoice tax rate must be between 0 and 100';
    END IF;

    line_amount := round((line->>'quantity')::numeric * (line->>'unit_price')::numeric,2);
    line_tax := round(line_amount * COALESCE((line->>'tax_rate')::numeric,0) / 100,2);
    subtotal := subtotal + line_amount;
    tax := tax + line_tax;
  END LOOP;

  IF subtotal + tax <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be greater than zero';
  END IF;

  IF tax > 0 AND p_supply NOT IN ('intra','inter') THEN
    RAISE EXCEPTION 'Select intra-state or inter-state tax treatment';
  END IF;

  IF p_supply='intra' THEN
    cgst := round(tax/2,2);
    sgst := tax-cgst;
  ELSIF p_supply='inter' THEN
    igst := tax;
  END IF;

  SELECT COALESCE(po.outstanding,0)
  INTO outstanding
  FROM public.party_outstanding po
  WHERE po.party_id=p_party_id;

  credit_limit := COALESCE(party.credit_limit,150000);

  IF outstanding + subtotal + tax >= credit_limit THEN
    RAISE EXCEPTION 'Credit limit exceeded: projected outstanding % >= limit %',
      round(outstanding+subtotal+tax,2), round(credit_limit,2);
  END IF;

  SELECT id INTO party_ledger
  FROM public.ledger_accounts
  WHERE mapped_party_id=p_party_id AND company_id=company AND COALESCE(is_active,true)
  LIMIT 1;

  SELECT id INTO sales_ledger
  FROM public.ledger_accounts
  WHERE name='Sales' AND company_id=company AND COALESCE(is_active,true)
  LIMIT 1;

  IF party_ledger IS NULL OR sales_ledger IS NULL THEN
    RAISE EXCEPTION 'Required party or Sales ledger is not configured';
  END IF;

  IF tax > 0 THEN
    IF p_supply='intra' THEN
      SELECT count(*) INTO tax_ledger_count
      FROM public.ledger_accounts
      WHERE company_id=company AND COALESCE(is_active,true)
        AND name IN ('Output CGST','Output SGST');
      IF tax_ledger_count<>2 THEN
        RAISE EXCEPTION 'Required output tax ledgers are not configured';
      END IF;
    ELSE
      SELECT count(*) INTO tax_ledger_count
      FROM public.ledger_accounts
      WHERE company_id=company AND COALESCE(is_active,true)
        AND name='Output IGST';
      IF tax_ledger_count<>1 THEN
        RAISE EXCEPTION 'Required output tax ledger is not configured';
      END IF;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-number:'||company::text,0));

  SELECT COALESCE(
    max(NULLIF(regexp_replace(invoice_number,'[^0-9]','','g'),'')::bigint),
    0
  ) + 1
  INTO number_no
  FROM public.invoices
  WHERE company_id=company;

  number_text := 'INV-' || lpad(number_no::text,8,'0');

  INSERT INTO public.invoices(
    company_id,invoice_number,party_id,invoice_date,due_date,
    subtotal,tax_amount,cgst_amount,sgst_amount,igst_amount,
    total_amount,notes,created_by
  )
  VALUES(
    company,number_text,p_party_id,p_invoice_date,p_due_date,
    round(subtotal,2),round(tax,2),round(cgst,2),round(sgst,2),round(igst,2),
    round(subtotal+tax,2),NULLIF(p_notes,''),auth.uid()
  )
  RETURNING public.invoices.id INTO invoice_id;

  INSERT INTO public.invoice_items(
    invoice_id,description,quantity,unit_price,amount,hsn_code,tax_rate
  )
  SELECT
    invoice_id,
    btrim(value->>'description'),
    (value->>'quantity')::numeric,
    (value->>'unit_price')::numeric,
    round((value->>'quantity')::numeric*(value->>'unit_price')::numeric,2),
    NULLIF(btrim(value->>'hsn_code'),''),
    (value->>'tax_rate')::numeric
  FROM jsonb_array_elements(p_lines);

  RETURN QUERY SELECT invoice_id,number_text;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_invoice_atomic(uuid,date,date,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(uuid,date,date,text,text,jsonb) TO authenticated;
