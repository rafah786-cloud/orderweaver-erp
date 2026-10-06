-- Canonical atomic stock-journal posting.
-- SECURITY DEFINER is intentional: clients call this function, while the function
-- validates the caller role and active company before performing the transaction.

CREATE OR REPLACE FUNCTION public.create_stock_journal(
  p_date date,
  p_narration text,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  company uuid:=public.current_company_id();
  journal_id uuid;
  journal_no text;
  line jsonb;
  item uuid;
  from_godown uuid;
  to_godown uuid;
  movement_type text;
  qty numeric;
  rate numeric;
  line_order integer:=0;
BEGIN
  IF company IS NULL THEN RAISE EXCEPTION 'No active company selected'; END IF;
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'accountant') OR
    public.has_role(auth.uid(),'production')
  ) THEN RAISE EXCEPTION 'Inventory access required'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines)=0 THEN
    RAISE EXCEPTION 'At least one journal line is required';
  END IF;
  IF jsonb_array_length(p_lines)>200 THEN
    RAISE EXCEPTION 'Too many journal lines';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('stock-journal:'||company::text,0));

  SELECT 'SJ/' || lpad(
    (COALESCE(max(NULLIF(regexp_replace(journal_number,'[^0-9]','','g'),''),'0')::bigint)+1)::text,
    4,'0'
  )
  INTO journal_no
  FROM public.stock_journals
  WHERE company_id=company;

  INSERT INTO public.stock_journals(
    company_id,journal_number,journal_date,journal_type,narration,created_by
  )
  VALUES(
    company,journal_no,COALESCE(p_date,CURRENT_DATE),'adjustment',
    NULLIF(btrim(p_narration),''),auth.uid()
  )
  RETURNING id INTO journal_id;

  FOR line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    item:=NULLIF(line->>'stock_item_id','')::uuid;
    from_godown:=NULLIF(line->>'from_godown_id','')::uuid;
    to_godown:=NULLIF(line->>'to_godown_id','')::uuid;
    movement_type:=lower(COALESCE(line->>'movement_type',''));
    qty:=NULLIF(line->>'quantity','')::numeric;
    rate:=COALESCE(NULLIF(line->>'rate','')::numeric,0);

    IF item IS NULL OR qty IS NULL OR rate<=0 THEN
      RAISE EXCEPTION 'Invalid stock journal line';
    END IF;

    PERFORM 1 FROM public.stock_items
    WHERE id=item AND company_id=company AND COALESCE(is_active,true);
    IF NOT FOUND THEN RAISE EXCEPTION 'Stock item is outside active company'; END IF;

    IF movement_type='adjustment' THEN
      IF qty=0 OR to_godown IS NULL THEN RAISE EXCEPTION 'Adjustment requires non-zero quantity and godown'; END IF;
      -- Existing canonical receipt/issue functions preserve the movement ledger;
      -- positive adjustments are receipts and negative adjustments are issues.
      IF qty>0 THEN
        PERFORM public.post_stock_receipt(
          item,to_godown,qty,rate,COALESCE(p_date,CURRENT_DATE),
          'stock-journal:'||journal_id::text||':'||line_order::text,
          'stock_journals',journal_id
        );
      ELSE
        PERFORM public.post_stock_issue(
          item,to_godown,abs(qty),COALESCE(p_date,CURRENT_DATE),
          'stock-journal:'||journal_id::text||':'||line_order::text,
          'stock_journals',journal_id,'adjustment'
        );
      END IF;
    ELSIF movement_type='production_in' THEN
      IF qty<=0 OR to_godown IS NULL THEN RAISE EXCEPTION 'Production In requires positive quantity and destination godown'; END IF;
      PERFORM public.post_stock_production_output(
        item,to_godown,qty,rate,COALESCE(p_date,CURRENT_DATE),
        'stock-journal:'||journal_id::text||':'||line_order::text,
        'stock_journals',journal_id
      );
    ELSIF movement_type='production_out' THEN
      IF qty<=0 OR from_godown IS NULL THEN RAISE EXCEPTION 'Production Out requires positive quantity and source godown'; END IF;
      PERFORM public.post_stock_issue(
        item,from_godown,qty,COALESCE(p_date,CURRENT_DATE),
        'stock-journal:'||journal_id::text||':'||line_order::text,
        'stock_journals',journal_id,'production_out'
      );
    ELSIF movement_type='transfer' THEN
      IF qty<=0 OR from_godown IS NULL OR to_godown IS NULL THEN
        RAISE EXCEPTION 'Transfer requires positive quantity and both godowns';
      END IF;
      PERFORM public.post_stock_transfer(
        item,from_godown,to_godown,qty,COALESCE(p_date,CURRENT_DATE),
        'stock-journal:'||journal_id::text||':'||line_order::text
      );
    ELSE
      RAISE EXCEPTION 'Unsupported journal movement type: %', movement_type;
    END IF;

    INSERT INTO public.stock_journal_entries(
      journal_id,stock_item_id,from_godown_id,to_godown_id,direction,
      quantity,rate,amount,line_order,company_id
    )
    VALUES(
      journal_id,item,from_godown,to_godown,
      CASE WHEN movement_type='production_out' THEN 'out'
           WHEN movement_type='transfer' THEN 'transfer'
           WHEN qty<0 THEN 'out' ELSE 'in' END,
      abs(qty),rate,round(abs(qty)*rate,2),line_order,company
    );

    line_order:=line_order+1;
  END LOOP;

  RETURN journal_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_stock_journal(date,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_journal(date,text,jsonb) TO authenticated;
