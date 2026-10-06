-- Canonical ERP posting engine and transaction controls.
-- Additive production-safe migration. It preserves all existing vouchers, bills and stock rows.
-- No historical record is rewritten by this migration.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_reason text;
CREATE UNIQUE INDEX IF NOT EXISTS vouchers_one_reversal_unique
  ON public.vouchers(reversal_of) WHERE reversal_of IS NOT NULL;

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS cancelled_on date,
  ADD COLUMN IF NOT EXISTS source_voiding_voucher_id uuid REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.bills ALTER COLUMN party_id DROP NOT NULL;
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_party_kind_identity_check;
ALTER TABLE public.bills ADD CONSTRAINT bills_party_kind_identity_check CHECK (
  (party_kind='customer' AND party_id IS NOT NULL AND supplier_id IS NULL)
  OR (party_kind='supplier' AND supplier_id IS NOT NULL AND party_id IS NULL)
);
CREATE INDEX IF NOT EXISTS bills_supplier_status_due_idx ON public.bills(supplier_id,status,due_date);

ALTER TABLE public.bill_allocations
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS reverses_allocation_id uuid REFERENCES public.bill_allocations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by uuid;
CREATE UNIQUE INDEX IF NOT EXISTS bill_allocations_one_reversal_unique
  ON public.bill_allocations(reverses_allocation_id) WHERE reverses_allocation_id IS NOT NULL;

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idempotency_key_unique
  ON public.stock_movements(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_gl_voucher_internal(
  p_type public.voucher_type,p_date date,p_entries jsonb,p_narration text DEFAULT NULL,
  p_reference text DEFAULT NULL,p_source_table text DEFAULT NULL,p_source_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,p_created_by uuid DEFAULT NULL
) RETURNS public.vouchers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.vouchers; existing public.vouchers; fy uuid; next_no integer; prefix text; width integer; suffix text;
line jsonb; line_count integer:=0; total_debit numeric:=0; total_credit numeric:=0; line_no integer:=0;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.vouchers WHERE idempotency_key=p_idempotency_key LIMIT 1;
    IF FOUND THEN RETURN existing; END IF;
  END IF;
  IF p_source_table IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.vouchers WHERE source_table=p_source_table AND source_id=p_source_id LIMIT 1;
    IF FOUND THEN RETURN existing; END IF;
  END IF;
  SELECT fy0.id INTO fy FROM public.financial_years fy0
  WHERE p_date BETWEEN fy0.start_date AND fy0.end_date AND COALESCE(fy0.is_locked,false)=false
  ORDER BY fy0.is_current DESC,fy0.start_date DESC LIMIT 1 FOR SHARE;
  IF fy IS NULL THEN RAISE EXCEPTION 'No open financial year for %',p_date; END IF;
  IF p_entries IS NULL OR jsonb_typeof(p_entries)<>'array' THEN RAISE EXCEPTION 'Voucher entries must be an array'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    line_count:=line_count+1;
    IF NULLIF(line->>'ledger_account_id','') IS NULL THEN RAISE EXCEPTION 'Ledger account is required on every voucher line'; END IF;
    IF COALESCE((line->>'debit')::numeric,0)<0 OR COALESCE((line->>'credit')::numeric,0)<0
       OR (COALESCE((line->>'debit')::numeric,0)>0)=(COALESCE((line->>'credit')::numeric,0)>0)
    THEN RAISE EXCEPTION 'Each voucher line must contain exactly one positive debit or credit'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ledger_accounts la WHERE la.id=(line->>'ledger_account_id')::uuid AND COALESCE(la.is_active,true))
    THEN RAISE EXCEPTION 'Invalid or inactive ledger account'; END IF;
    total_debit:=total_debit+COALESCE((line->>'debit')::numeric,0);
    total_credit:=total_credit+COALESCE((line->>'credit')::numeric,0);
  END LOOP;
  IF line_count<2 THEN RAISE EXCEPTION 'At least two voucher lines are required'; END IF;
  IF round(total_debit,2)<>round(total_credit,2) OR round(total_debit,2)<=0 THEN RAISE EXCEPTION 'Voucher is not balanced'; END IF;
  SELECT s.next_number,s.prefix,s.width,s.suffix INTO next_no,prefix,width,suffix
  FROM public.voucher_number_series s WHERE s.voucher_type=p_type FOR UPDATE;
  IF next_no IS NULL THEN RAISE EXCEPTION 'Voucher number series missing for %',p_type; END IF;
  UPDATE public.voucher_number_series SET next_number=next_number+1,updated_at=now() WHERE voucher_type=p_type;
  INSERT INTO public.vouchers(
    voucher_number,voucher_type,voucher_date,narration,reference,source_table,source_id,is_locked,
    financial_year_id,created_by,idempotency_key
  ) VALUES(
    prefix||lpad(next_no::text,width,'0')||suffix,p_type,p_date,p_narration,p_reference,p_source_table,p_source_id,true,
    fy,p_created_by,p_idempotency_key
  ) RETURNING * INTO result;
  FOR line IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    line_no:=line_no+1;
    INSERT INTO public.voucher_entries(
      voucher_id,ledger_account_id,cost_center_id,debit,credit,narration,line_order
    ) VALUES(
      result.id,(line->>'ledger_account_id')::uuid,NULLIF(line->>'cost_center_id','')::uuid,
      COALESCE((line->>'debit')::numeric,0),COALESCE((line->>'credit')::numeric,0),
      NULLIF(line->>'narration',''),COALESCE((line->>'line_order')::integer,line_no)
    );
  END LOOP;
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.vouchers WHERE idempotency_key=p_idempotency_key LIMIT 1;
    IF FOUND THEN RETURN existing; END IF;
  END IF;
  IF p_source_table IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.vouchers WHERE source_table=p_source_table AND source_id=p_source_id LIMIT 1;
    IF FOUND THEN RETURN existing; END IF;
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_gl_voucher(
  _type public.voucher_type,_date date,_entries jsonb,_narration text DEFAULT NULL,
  _reference text DEFAULT NULL,_idempotency_key text DEFAULT NULL
) RETURNS TABLE(id uuid,voucher_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.vouchers;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') AND NOT public.has_role(auth.uid(),'accountant')
  THEN RAISE EXCEPTION 'Accounting access required'; END IF;
  v:=public.create_gl_voucher_internal(_type,_date,_entries,_narration,_reference,NULL,NULL,_idempotency_key,auth.uid());
  id:=v.id; voucher_number:=v.voucher_number; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_invoice_tax(p_invoice uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id=p_invoice;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF round(COALESCE(inv.cgst_amount,0)+COALESCE(inv.sgst_amount,0)+COALESCE(inv.igst_amount,0),2)<>round(COALESCE(inv.tax_amount,0),2)
  THEN RAISE EXCEPTION 'Invoice tax components do not equal tax amount'; END IF;
  IF COALESCE(inv.tax_amount,0)=0 THEN DELETE FROM public.invoice_tax_snapshots WHERE invoice_id=p_invoice; RETURN; END IF;
  INSERT INTO public.invoice_tax_snapshots(invoice_id,taxable_value,cgst,sgst,igst,cess)
  VALUES(p_invoice,COALESCE(inv.subtotal,0),COALESCE(inv.cgst_amount,0),COALESCE(inv.sgst_amount,0),COALESCE(inv.igst_amount,0),0)
  ON CONFLICT(invoice_id) DO UPDATE SET taxable_value=EXCLUDED.taxable_value,cgst=EXCLUDED.cgst,sgst=EXCLUDED.sgst,igst=EXCLUDED.igst,cess=EXCLUDED.cess;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_invoice_bill(p_invoice uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices%ROWTYPE; v public.vouchers%ROWTYPE; bill_id uuid;
party_ledger uuid; sales_ledger uuid; cgst_ledger uuid; sgst_ledger uuid; igst_ledger uuid; party_entry uuid; entries jsonb;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id=p_invoice FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.party_id IS NULL THEN RAISE EXCEPTION 'Invoice party is required'; END IF;
  SELECT id INTO bill_id FROM public.bills WHERE source_invoice_id=p_invoice LIMIT 1;
  IF bill_id IS NOT NULL THEN RETURN bill_id; END IF;
  IF inv.total_amount<=0 OR inv.subtotal<=0 THEN RAISE EXCEPTION 'Invoice amount must be positive'; END IF;
  IF COALESCE(inv.tax_amount,0)=0 AND round(inv.total_amount,2)<>round(inv.subtotal,2) THEN RAISE EXCEPTION 'Tax-free invoice total must equal subtotal'; END IF;
  IF COALESCE(inv.tax_amount,0)>0 THEN
    IF round(COALESCE(inv.cgst_amount,0)+COALESCE(inv.sgst_amount,0)+COALESCE(inv.igst_amount,0),2)<>round(inv.tax_amount,2)
    THEN RAISE EXCEPTION 'Taxed invoice requires explicit stored tax components'; END IF;
    SELECT id INTO cgst_ledger FROM public.ledger_accounts WHERE name='Output CGST' AND COALESCE(is_active,true) LIMIT 1;
    SELECT id INTO sgst_ledger FROM public.ledger_accounts WHERE name='Output SGST' AND COALESCE(is_active,true) LIMIT 1;
    SELECT id INTO igst_ledger FROM public.ledger_accounts WHERE name='Output IGST' AND COALESCE(is_active,true) LIMIT 1;
    IF COALESCE(inv.cgst_amount,0)>0 AND cgst_ledger IS NULL THEN RAISE EXCEPTION 'Active Output CGST ledger required'; END IF;
    IF COALESCE(inv.sgst_amount,0)>0 AND sgst_ledger IS NULL THEN RAISE EXCEPTION 'Active Output SGST ledger required'; END IF;
    IF COALESCE(inv.igst_amount,0)>0 AND igst_ledger IS NULL THEN RAISE EXCEPTION 'Active Output IGST ledger required'; END IF;
    PERFORM public.snapshot_invoice_tax(p_invoice);
  END IF;
  party_ledger:=public.get_or_create_party_ledger(inv.party_id);
  SELECT id INTO sales_ledger FROM public.ledger_accounts WHERE name='Sales' AND COALESCE(is_active,true) LIMIT 1;
  IF sales_ledger IS NULL THEN RAISE EXCEPTION 'Active Sales ledger required'; END IF;
  entries:=jsonb_build_array(
    jsonb_build_object('ledger_account_id',party_ledger,'debit',inv.total_amount,'credit',0,'line_order',1),
    jsonb_build_object('ledger_account_id',sales_ledger,'debit',0,'credit',inv.subtotal,'line_order',2)
  );
  IF COALESCE(inv.cgst_amount,0)>0 THEN entries:=entries||jsonb_build_array(jsonb_build_object('ledger_account_id',cgst_ledger,'debit',0,'credit',inv.cgst_amount,'line_order',3)); END IF;
  IF COALESCE(inv.sgst_amount,0)>0 THEN entries:=entries||jsonb_build_array(jsonb_build_object('ledger_account_id',sgst_ledger,'debit',0,'credit',inv.sgst_amount,'line_order',4)); END IF;
  IF COALESCE(inv.igst_amount,0)>0 THEN entries:=entries||jsonb_build_array(jsonb_build_object('ledger_account_id',igst_ledger,'debit',0,'credit',inv.igst_amount,'line_order',5)); END IF;
  SELECT * INTO v FROM public.create_gl_voucher_internal(
    'sales',COALESCE(inv.invoice_date,CURRENT_DATE),entries,'Auto: Invoice '||inv.invoice_number,inv.invoice_number,
    'invoices',inv.id,'invoice:'||inv.id::text,inv.created_by
  );
  SELECT ve.id INTO party_entry FROM public.voucher_entries ve WHERE ve.voucher_id=v.id AND ve.ledger_account_id=party_ledger ORDER BY ve.line_order LIMIT 1;
  IF party_entry IS NULL THEN RAISE EXCEPTION 'Invoice voucher has no receivable party entry'; END IF;
  INSERT INTO public.bills(
    party_kind,party_id,supplier_id,ledger_account_id,bill_reference,bill_date,due_date,reference_type,original_amount,
    source_voucher_id,source_voucher_entry_id,source_invoice_id,external_ref,status
  ) VALUES(
    'customer',inv.party_id,NULL,party_ledger,inv.invoice_number,inv.invoice_date,inv.due_date,'new_ref',inv.total_amount,
    v.id,party_entry,inv.id,'invoice:'||inv.id::text,'open'
  )
  ON CONFLICT (external_ref) DO UPDATE SET source_invoice_id=EXCLUDED.source_invoice_id
  RETURNING id INTO bill_id;
  IF bill_id IS NULL THEN SELECT id INTO bill_id FROM public.bills WHERE external_ref='invoice:'||inv.id::text LIMIT 1; END IF;
  RETURN bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_invoice_to_voucher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.ensure_invoice_bill(NEW.id); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_purchase_bill(p_bill uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pb public.purchase_bills%ROWTYPE; v public.vouchers%ROWTYPE; supplier_ledger uuid; purchase_ledger uuid; supplier_entry uuid; bill_id uuid; entries jsonb;
BEGIN
  SELECT * INTO pb FROM public.purchase_bills WHERE id=p_bill FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase bill not found'; END IF;
  IF pb.supplier_id IS NULL THEN RAISE EXCEPTION 'Supplier is required for accounting posting'; END IF;
  IF pb.total_amount<=0 THEN RAISE EXCEPTION 'Purchase amount must be positive'; END IF;
  SELECT id INTO bill_id FROM public.bills WHERE external_ref='purchase-bill:'||p_bill::text LIMIT 1;
  IF bill_id IS NOT NULL THEN RETURN bill_id; END IF;
  supplier_ledger:=public.get_or_create_supplier_ledger(pb.supplier_id);
  SELECT id INTO purchase_ledger FROM public.ledger_accounts WHERE name='Purchases' AND COALESCE(is_active,true) LIMIT 1;
  IF purchase_ledger IS NULL THEN RAISE EXCEPTION 'Active Purchases ledger required'; END IF;
  entries:=jsonb_build_array(
    jsonb_build_object('ledger_account_id',purchase_ledger,'debit',pb.total_amount,'credit',0,'line_order',1),
    jsonb_build_object('ledger_account_id',supplier_ledger,'debit',0,'credit',pb.total_amount,'line_order',2)
  );
  SELECT * INTO v FROM public.create_gl_voucher_internal(
    'purchase',COALESCE(pb.bill_date,CURRENT_DATE),entries,'Auto: Bill '||pb.bill_number,pb.bill_number,
    'purchase_bills',pb.id,'purchase-bill:'||pb.id::text,pb.created_by
  );
  SELECT ve.id INTO supplier_entry FROM public.voucher_entries ve WHERE ve.voucher_id=v.id AND ve.ledger_account_id=supplier_ledger ORDER BY ve.line_order LIMIT 1;
  IF supplier_entry IS NULL THEN RAISE EXCEPTION 'Purchase voucher has no supplier payable entry'; END IF;
  INSERT INTO public.bills(
    party_kind,party_id,supplier_id,ledger_account_id,bill_reference,bill_date,due_date,reference_type,original_amount,
    source_voucher_id,source_voucher_entry_id,external_ref,status
  ) VALUES(
    'supplier',NULL,pb.supplier_id,supplier_ledger,pb.bill_number,pb.bill_date,pb.bill_date,'new_ref',pb.total_amount,
    v.id,supplier_entry,'purchase-bill:'||pb.id,'open'
  )
  ON CONFLICT (external_ref) DO UPDATE SET external_ref=EXCLUDED.external_ref
  RETURNING id INTO bill_id;
  RETURN bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_purchase_to_voucher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF COALESCE(NEW.receipt_status,'draft')<>'received' THEN RETURN NEW; END IF;
  PERFORM public.ensure_purchase_bill(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_canonical_bill_status(p_bill uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE original numeric; applied numeric;
BEGIN
  SELECT original_amount INTO original FROM public.bills WHERE id=p_bill FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
  SELECT COALESCE(sum(effect*amount),0) INTO applied FROM public.bill_allocations WHERE bill_id=p_bill;
  IF EXISTS (SELECT 1 FROM public.bills WHERE id=p_bill AND status='cancelled') THEN RETURN; END IF;
  UPDATE public.bills SET status=CASE WHEN applied<=0 THEN 'open' WHEN applied<original THEN 'partial' ELSE 'settled' END,updated_at=now() WHERE id=p_bill;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_receipt(p_invoice uuid,p_amount numeric,p_idempotency text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices%ROWTYPE; bill public.bills%ROWTYPE; existing_allocation public.bill_allocations%ROWTYPE; cash uuid; party_ledger uuid; v public.vouchers%ROWTYPE; party_entry uuid; due numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'sales')) THEN RAISE EXCEPTION 'Sales or accounting access required'; END IF;
  IF p_amount<=0 THEN RAISE EXCEPTION 'Receipt amount must be positive'; END IF;
  IF p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  SELECT * INTO existing_allocation FROM public.bill_allocations WHERE idempotency_key=p_idempotency LIMIT 1;
  IF FOUND THEN RETURN public.bill_outstanding(existing_allocation.bill_id); END IF;
  SELECT * INTO inv FROM public.invoices WHERE id=p_invoice FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.status='cancelled' THEN RAISE EXCEPTION 'Invoice cancelled'; END IF;
  PERFORM public.ensure_invoice_bill(p_invoice);
  SELECT * INTO bill FROM public.bills WHERE source_invoice_id=p_invoice FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receivable bill not found'; END IF;
  due:=public.bill_outstanding(bill.id);
  IF due<=0 THEN RAISE EXCEPTION 'Invoice has no outstanding balance'; END IF;
  IF p_amount>due+0.01 THEN RAISE EXCEPTION 'Receipt exceeds outstanding balance'; END IF;
  party_ledger:=bill.ledger_account_id;
  SELECT id INTO cash FROM public.ledger_accounts WHERE name='Cash' AND COALESCE(is_active,true) LIMIT 1;
  IF cash IS NULL THEN RAISE EXCEPTION 'Active Cash ledger required'; END IF;
  SELECT * INTO v FROM public.create_gl_voucher_internal(
    'receipt',CURRENT_DATE,
    jsonb_build_array(
      jsonb_build_object('ledger_account_id',cash,'debit',p_amount,'credit',0,'line_order',1),
      jsonb_build_object('ledger_account_id',party_ledger,'debit',0,'credit',p_amount,'line_order',2)
    ),
    'Receipt against '||inv.invoice_number,inv.invoice_number,'invoice_receipts',inv.id,p_idempotency,auth.uid()
  );
  SELECT ve.id INTO party_entry FROM public.voucher_entries ve WHERE ve.voucher_id=v.id AND ve.ledger_account_id=party_ledger ORDER BY ve.line_order DESC LIMIT 1;
  INSERT INTO public.bill_allocations(
    bill_id,settlement_voucher_id,settlement_voucher_entry_id,allocation_type,allocation_date,amount,effect,idempotency_key,created_by
  ) VALUES(bill.id,v.id,party_entry,'against_ref',CURRENT_DATE,p_amount,1,p_idempotency,auth.uid());
  PERFORM public.refresh_canonical_bill_status(bill.id);
  UPDATE public.invoices SET
    paid_amount=LEAST(total_amount,GREATEST(0,total_amount-public.bill_outstanding(bill.id))),
    status=(CASE WHEN public.bill_outstanding(bill.id)<=0.01 THEN 'paid' ELSE 'partial' END)::public.invoice_status,
    updated_at=now()
  WHERE id=p_invoice;
  RETURN public.bill_outstanding(bill.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_bill_settlement(
  p_type public.voucher_type,p_date date,p_cash_ledger uuid,p_allocations jsonb,p_reference text,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.vouchers%ROWTYPE; item jsonb; bill public.bills%ROWTYPE; first_bill public.bills%ROWTYPE; total numeric:=0; party_entry uuid; v public.vouchers%ROWTYPE; entries jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN RAISE EXCEPTION 'Accounting access required'; END IF;
  IF p_type NOT IN ('receipt','payment') THEN RAISE EXCEPTION 'Settlement type must be receipt or payment'; END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key))<8 THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  SELECT * INTO existing FROM public.vouchers WHERE idempotency_key=p_idempotency_key LIMIT 1;
  IF FOUND THEN RETURN existing.id; END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array' OR jsonb_array_length(p_allocations)=0 THEN RAISE EXCEPTION 'At least one allocation is required'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
    SELECT * INTO bill FROM public.bills WHERE id=(item->>'bill_id')::uuid FOR UPDATE;
    IF NOT FOUND OR bill.status='cancelled' THEN RAISE EXCEPTION 'Open bill not found'; END IF;
    IF bill.bill_date>p_date THEN RAISE EXCEPTION 'Cannot settle a future bill'; END IF;
    IF first_bill.id IS NULL THEN first_bill:=bill; END IF;
    IF bill.ledger_account_id<>first_bill.ledger_account_id THEN RAISE EXCEPTION 'All allocations must use one party ledger'; END IF;
    IF (p_type='receipt' AND bill.party_kind<>'customer') OR (p_type='payment' AND bill.party_kind<>'supplier') THEN RAISE EXCEPTION 'Settlement type does not match bill kind'; END IF;
    IF (item->>'amount')::numeric<=0 OR round((item->>'amount')::numeric,2)<>(item->>'amount')::numeric THEN RAISE EXCEPTION 'Invalid allocation amount'; END IF;
    IF (item->>'amount')::numeric>public.bill_outstanding(bill.id)+0.01 THEN RAISE EXCEPTION 'Allocation exceeds outstanding bill'; END IF;
    total:=total+(item->>'amount')::numeric;
  END LOOP;
  IF p_cash_ledger IS NULL OR p_cash_ledger=first_bill.ledger_account_id THEN RAISE EXCEPTION 'Valid settlement ledger is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ledger_accounts WHERE id=p_cash_ledger AND COALESCE(is_active,true)) THEN RAISE EXCEPTION 'Settlement ledger is inactive or missing'; END IF;
  IF p_type='receipt' THEN
    entries:=jsonb_build_array(jsonb_build_object('ledger_account_id',p_cash_ledger,'debit',total,'credit',0,'line_order',1),jsonb_build_object('ledger_account_id',first_bill.ledger_account_id,'debit',0,'credit',total,'line_order',2));
  ELSE
    entries:=jsonb_build_array(jsonb_build_object('ledger_account_id',first_bill.ledger_account_id,'debit',total,'credit',0,'line_order',1),jsonb_build_object('ledger_account_id',p_cash_ledger,'debit',0,'credit',total,'line_order',2));
  END IF;
  SELECT * INTO v FROM public.create_gl_voucher_internal(p_type,p_date,entries,COALESCE(p_reference,'Bill settlement'),p_reference,'bill_settlements',NULL,p_idempotency_key,auth.uid());
  SELECT ve.id INTO party_entry FROM public.voucher_entries ve WHERE ve.voucher_id=v.id AND ve.ledger_account_id=first_bill.ledger_account_id ORDER BY ve.line_order LIMIT 1;
  FOR item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
    INSERT INTO public.bill_allocations(
      bill_id,settlement_voucher_id,settlement_voucher_entry_id,allocation_type,allocation_date,amount,effect,idempotency_key,created_by
    ) VALUES(
      (item->>'bill_id')::uuid,v.id,party_entry,COALESCE(NULLIF(item->>'allocation_type',''),'against_ref'),p_date,(item->>'amount')::numeric,1,p_idempotency_key||':'||(item->>'bill_id'),auth.uid()
    );
    PERFORM public.refresh_canonical_bill_status((item->>'bill_id')::uuid);
  END LOOP;
  RETURN v.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_gl_voucher(p_voucher uuid,p_date date,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE original public.vouchers%ROWTYPE; existing public.vouchers%ROWTYPE; v public.vouchers%ROWTYPE; entries jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN RAISE EXCEPTION 'Accounting access required'; END IF;
  IF NULLIF(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reversal reason required'; END IF;
  SELECT * INTO original FROM public.vouchers WHERE id=p_voucher FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher not found'; END IF;
  IF original.reversed_by IS NOT NULL THEN SELECT * INTO existing FROM public.vouchers WHERE id=original.reversed_by; RETURN existing.id; END IF;
  IF COALESCE(original.is_locked,false)=false THEN RAISE EXCEPTION 'Only posted vouchers can be reversed'; END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'ledger_account_id',ve.ledger_account_id,'cost_center_id',ve.cost_center_id,'debit',ve.credit,'credit',ve.debit,
    'narration',COALESCE(ve.narration,p_reason),'line_order',ve.line_order
  ) ORDER BY ve.line_order) INTO entries FROM public.voucher_entries ve WHERE ve.voucher_id=original.id;
  IF entries IS NULL OR jsonb_array_length(entries)<2 THEN RAISE EXCEPTION 'Voucher has no reversible entries'; END IF;
  SELECT * INTO v FROM public.create_gl_voucher_internal(
    original.voucher_type,COALESCE(p_date,CURRENT_DATE),entries,
    'Reversal of '||original.voucher_number||': '||p_reason,'REV-'||original.voucher_number,
    'voucher_reversals',original.id,'reversal:'||original.id::text,auth.uid()
  );
  UPDATE public.vouchers SET reversed_by=v.id,reversal_reason=p_reason,updated_at=now() WHERE id=original.id;
  UPDATE public.vouchers SET reversal_of=original.id,reversal_reason=p_reason,updated_at=now() WHERE id=v.id;
  RETURN v.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_bill_settlement(p_voucher uuid,p_date date,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reversal_id uuid; a public.bill_allocations%ROWTYPE; reverse_entry uuid;
BEGIN
  reversal_id:=public.reverse_gl_voucher(p_voucher,p_date,p_reason);
  FOR a IN SELECT * FROM public.bill_allocations WHERE settlement_voucher_id=p_voucher AND effect=1 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.bill_allocations WHERE reverses_allocation_id=a.id) THEN
      SELECT ve.id INTO reverse_entry FROM public.voucher_entries ve
      JOIN public.bills b ON b.ledger_account_id=ve.ledger_account_id
      WHERE ve.voucher_id=reversal_id AND b.id=a.bill_id ORDER BY ve.line_order LIMIT 1;
      IF reverse_entry IS NULL THEN RAISE EXCEPTION 'Settlement reversal has no party ledger entry'; END IF;
      INSERT INTO public.bill_allocations(
        bill_id,settlement_voucher_id,settlement_voucher_entry_id,allocation_type,allocation_date,amount,effect,reverses_allocation_id,idempotency_key,created_by
      ) VALUES(
        a.bill_id,reversal_id,reverse_entry,a.allocation_type,COALESCE(p_date,CURRENT_DATE),a.amount,-1,a.id,'reverse-allocation:'||a.id::text,auth.uid()
      );
    END IF;
    PERFORM public.refresh_canonical_bill_status(a.bill_id);
    UPDATE public.invoices i
    SET paid_amount=GREATEST(0,i.total_amount-public.bill_outstanding(a.bill_id)),
        status=(CASE WHEN public.bill_outstanding(a.bill_id)<=0.01 THEN 'paid' ELSE 'partial' END)::public.invoice_status,
        updated_at=now()
    FROM public.bills b
    WHERE b.id=a.bill_id AND b.source_invoice_id=i.id;
  END LOOP;
  RETURN reversal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_invoice(p_invoice uuid,p_idempotency text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.invoices%ROWTYPE; bill public.bills%ROWTYPE; existing public.vouchers%ROWTYPE; reversal uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'sales')) THEN RAISE EXCEPTION 'Sales or accounting access required'; END IF;
  IF p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  SELECT * INTO existing FROM public.vouchers WHERE idempotency_key=p_idempotency LIMIT 1;
  IF FOUND THEN RETURN existing.id; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id=p_invoice FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.status='cancelled' THEN RAISE EXCEPTION 'Invoice already cancelled'; END IF;
  SELECT * INTO bill FROM public.bills WHERE source_invoice_id=p_invoice FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice receivable bill not found'; END IF;
  IF abs(public.bill_outstanding(bill.id)-bill.original_amount)>0.01 THEN RAISE EXCEPTION 'Reverse all receipts before cancelling invoice'; END IF;
  reversal:=public.reverse_gl_voucher(bill.source_voucher_id,CURRENT_DATE,'Invoice cancellation');
  UPDATE public.bills SET status='cancelled',cancelled_on=CURRENT_DATE,source_voiding_voucher_id=reversal,updated_at=now() WHERE id=bill.id;
  UPDATE public.invoices SET status='cancelled',paid_amount=0,updated_at=now() WHERE id=p_invoice;
  UPDATE public.vouchers SET idempotency_key=p_idempotency WHERE id=reversal;
  RETURN reversal;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_bill(p_bill uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pb public.purchase_bills%ROWTYPE; line record; stock_item uuid; def_g uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'production')) THEN RAISE EXCEPTION 'Purchasing/inventory access required'; END IF;
  SELECT * INTO pb FROM public.purchase_bills WHERE id=p_bill FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase bill not found'; END IF;
  IF pb.receipt_status='cancelled' THEN RAISE EXCEPTION 'Purchase bill is cancelled'; END IF;
  IF pb.receipt_status='received' THEN RETURN pb.id; END IF;
  SELECT default_godown_id INTO def_g FROM public.stock_valuation_settings LIMIT 1;
  IF def_g IS NULL THEN RAISE EXCEPTION 'Default godown is not configured'; END IF;
  FOR line IN SELECT pbi.id,pbi.raw_material_id,pbi.quantity,pbi.unit_price FROM public.purchase_bill_items pbi WHERE pbi.purchase_bill_id=p_bill ORDER BY pbi.id LOOP
    IF line.quantity<=0 OR line.unit_price<=0 THEN RAISE EXCEPTION 'Purchase line quantity and rate must be positive'; END IF;
    SELECT id INTO stock_item FROM public.stock_items WHERE mapped_raw_material_id=line.raw_material_id AND COALESCE(is_active,true) LIMIT 1;
    IF stock_item IS NULL THEN RAISE EXCEPTION 'No stock item mapping for purchase raw material %',line.raw_material_id; END IF;
    PERFORM public.post_stock_receipt(stock_item,def_g,line.quantity,line.unit_price,COALESCE(pb.bill_date,CURRENT_DATE),'purchase-receipt:'||p_bill::text||':'||line.id::text,'purchase_bill',p_bill);
  END LOOP;
  UPDATE public.purchase_bills SET receipt_status='received',updated_at=now() WHERE id=p_bill;
  RETURN p_bill;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_stock_receipt(
  p_item uuid,p_godown uuid,p_qty numeric,p_rate numeric,p_date date,p_key text,p_source text DEFAULT NULL,p_source_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid; movement uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'production')) THEN RAISE EXCEPTION 'Inventory access required'; END IF;
  IF p_key IS NULL OR btrim(p_key)='' THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key=p_key LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_qty<=0 OR p_rate<=0 THEN RAISE EXCEPTION 'Receipt quantity and rate must be positive'; END IF;
  PERFORM 1 FROM public.stock_items WHERE id=p_item AND COALESCE(is_active,true) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active stock item not found'; END IF;
  IF p_godown IS NULL OR NOT EXISTS (SELECT 1 FROM public.godowns WHERE id=p_godown) THEN RAISE EXCEPTION 'Valid godown required'; END IF;
  INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,source_id,idempotency_key,created_by)
  VALUES(p_item,p_godown,'purchase',p_qty,p_rate,round(p_qty*p_rate,2),COALESCE(p_date,CURRENT_DATE),p_source,p_source_id,p_key,auth.uid())
  RETURNING id INTO movement;
  RETURN movement;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_stock_issue(
  p_item uuid,p_godown uuid,p_qty numeric,p_date date,p_key text,p_source text DEFAULT NULL,p_source_id uuid DEFAULT NULL,p_movement_type public.stock_movement_type DEFAULT 'sale'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid; movement uuid; available numeric; on_hand_qty numeric; on_hand_value numeric; avg_rate numeric; allow_neg boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'production')) THEN RAISE EXCEPTION 'Inventory access required'; END IF;
  IF p_key IS NULL OR btrim(p_key)='' THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key=p_key LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF p_qty<=0 THEN RAISE EXCEPTION 'Issue quantity must be positive'; END IF;
  IF p_movement_type NOT IN ('sale','production_out','transfer_out','adjustment') THEN RAISE EXCEPTION 'Invalid issue movement type'; END IF;
  PERFORM 1 FROM public.stock_items WHERE id=p_item AND COALESCE(is_active,true) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active stock item not found'; END IF;
  IF p_godown IS NULL OR NOT EXISTS (SELECT 1 FROM public.godowns WHERE id=p_godown) THEN RAISE EXCEPTION 'Valid godown required'; END IF;
  SELECT
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END),0),
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -amount ELSE amount END),0)
  INTO available,on_hand_value
  FROM public.stock_movements WHERE stock_item_id=p_item AND godown_id=p_godown;
  SELECT COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END),0)
  INTO on_hand_qty FROM public.stock_movements WHERE stock_item_id=p_item AND godown_id=p_godown;
  SELECT COALESCE((SELECT allow_negative_stock FROM public.stock_valuation_settings LIMIT 1),false) INTO allow_neg;
  IF NOT allow_neg AND available<p_qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
  IF on_hand_qty<=0 OR on_hand_value<=0 THEN RAISE EXCEPTION 'Stock has no rated value'; END IF;
  avg_rate:=on_hand_value/on_hand_qty;
  INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,source_id,idempotency_key,created_by)
  VALUES(p_item,p_godown,p_movement_type,p_qty,avg_rate,round(p_qty*avg_rate,2),COALESCE(p_date,CURRENT_DATE),p_source,p_source_id,p_key,auth.uid())
  RETURNING id INTO movement;
  RETURN movement;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_stock_transfer(
  p_item uuid,p_from_godown uuid,p_to_godown uuid,p_qty numeric,p_date date,p_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid; out_id uuid; from_qty numeric; from_value numeric; rate numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'production')) THEN RAISE EXCEPTION 'Inventory access required'; END IF;
  IF p_key IS NULL OR btrim(p_key)='' OR p_qty<=0 OR p_from_godown IS NULL OR p_to_godown IS NULL OR p_from_godown=p_to_godown THEN RAISE EXCEPTION 'Invalid godown transfer'; END IF;
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key=p_key||':out' LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  PERFORM 1 FROM public.stock_items WHERE id=p_item AND COALESCE(is_active,true) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active stock item not found'; END IF;
  SELECT
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END),0),
    COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -amount ELSE amount END),0)
  INTO from_qty,from_value FROM public.stock_movements WHERE stock_item_id=p_item AND godown_id=p_from_godown;
  IF from_qty<p_qty THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
  IF from_qty<=0 OR from_value<=0 THEN RAISE EXCEPTION 'Source stock has no rated value'; END IF;
  rate:=from_value/from_qty;
  INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,idempotency_key,created_by)
  VALUES(p_item,p_from_godown,'transfer_out',p_qty,rate,round(p_qty*rate,2),COALESCE(p_date,CURRENT_DATE),'stock_transfer',p_key||':out',auth.uid())
  RETURNING id INTO out_id;
  INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,idempotency_key,created_by)
  VALUES(p_item,p_to_godown,'transfer_in',p_qty,rate,round(p_qty*rate,2),COALESCE(p_date,CURRENT_DATE),'stock_transfer',p_key||':in',auth.uid());
  RETURN out_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_stock_movement(p_movement uuid,p_date date,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing uuid; original public.stock_movements%ROWTYPE; opposite public.stock_movement_type; movement uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'production')) THEN RAISE EXCEPTION 'Inventory access required'; END IF;
  IF p_key IS NULL OR btrim(p_key)='' THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  SELECT id INTO existing FROM public.stock_movements WHERE idempotency_key=p_key LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  SELECT * INTO original FROM public.stock_movements WHERE id=p_movement FOR UPDATE;
  IF NOT FOUND OR original.movement_type='opening' THEN RAISE EXCEPTION 'Movement cannot be reversed'; END IF;
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE reverses_posting_id=original.id) THEN
    SELECT id INTO existing FROM public.stock_movements WHERE reverses_posting_id=original.id LIMIT 1; RETURN existing;
  END IF;
  opposite:=CASE original.movement_type
    WHEN 'purchase' THEN 'sale'::public.stock_movement_type
    WHEN 'sale' THEN 'purchase'::public.stock_movement_type
    WHEN 'transfer_in' THEN 'transfer_out'::public.stock_movement_type
    WHEN 'transfer_out' THEN 'transfer_in'::public.stock_movement_type
    WHEN 'production_in' THEN 'production_out'::public.stock_movement_type
    WHEN 'production_out' THEN 'production_in'::public.stock_movement_type
    WHEN 'adjustment' THEN 'adjustment'::public.stock_movement_type
    ELSE NULL END;
  IF opposite IS NULL THEN RAISE EXCEPTION 'Movement type cannot be reversed'; END IF;
  PERFORM 1 FROM public.stock_items WHERE id=original.stock_item_id AND COALESCE(is_active,true) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;
  INSERT INTO public.stock_movements(stock_item_id,godown_id,movement_type,quantity,rate,amount,movement_date,source_table,source_id,idempotency_key,reverses_posting_id,created_by)
  VALUES(original.stock_item_id,original.godown_id,opposite,original.quantity,original.rate,original.amount,COALESCE(p_date,CURRENT_DATE),'stock_reversal',original.source_id,p_key,original.id,auth.uid())
  RETURNING id INTO movement;
  RETURN movement;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_sales_order(p_order uuid,p_godown uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE so public.sales_orders%ROWTYPE; line record; stock_item uuid; def_g uuid; on_hand numeric; reserved numeric; required_qty numeric; n integer:=0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'production')) THEN RAISE EXCEPTION 'Sales/order access required'; END IF;
  SELECT * INTO so FROM public.sales_orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order not found'; END IF;
  IF so.fulfillment_status='cancelled' THEN RAISE EXCEPTION 'Sales order cancelled'; END IF;
  IF so.fulfillment_status IN ('confirmed','dispatched') THEN RETURN (SELECT count(*) FROM public.stock_reservations WHERE source_table='sales_orders' AND source_id=p_order AND status='open'); END IF;
  SELECT COALESCE(p_godown,default_godown_id) INTO def_g FROM public.stock_valuation_settings LIMIT 1;
  IF def_g IS NULL THEN RAISE EXCEPTION 'Default godown is not configured'; END IF;
  FOR line IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
    SELECT id INTO stock_item FROM public.stock_items WHERE mapped_model_id=line.model_id AND COALESCE(is_active,true) LIMIT 1;
    IF stock_item IS NULL THEN RAISE EXCEPTION 'No finished-goods stock item mapped to model %',line.model_id; END IF;
    SELECT COALESCE(sum(CASE WHEN movement_type IN ('sale','transfer_out','production_out') THEN -quantity ELSE quantity END),0)
    INTO on_hand FROM public.stock_movements WHERE stock_item_id=stock_item AND godown_id=def_g;
    SELECT COALESCE(sum(qty) FILTER (WHERE status='open'),0) INTO reserved
    FROM public.stock_reservations WHERE stock_item_id=stock_item AND godown_id=def_g AND source_table='sales_orders' AND source_id<>p_order;
    required_qty:=line.quantity;
    IF on_hand-reserved<required_qty THEN RAISE EXCEPTION 'Insufficient available finished stock for model %',line.model_id; END IF;
    INSERT INTO public.stock_reservations(stock_item_id,godown_id,qty,source_table,source_id,status,idempotency_key)
    VALUES(stock_item,def_g,required_qty,'sales_orders',p_order,'open','reserve:'||p_order::text||':'||line.id::text)
    ON CONFLICT(idempotency_key) DO NOTHING;
    n:=n+1;
  END LOOP;
  UPDATE public.sales_orders SET fulfillment_status='confirmed',updated_at=now() WHERE id=p_order;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_sales_order(p_order uuid,p_godown uuid,p_idempotency text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE so public.sales_orders%ROWTYPE; def_g uuid; line record; stock_item uuid; n integer:=0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'sales') OR public.has_role(auth.uid(),'production')) THEN RAISE EXCEPTION 'Sales/order access required'; END IF;
  IF p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  SELECT * INTO so FROM public.sales_orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order not found'; END IF;
  IF so.fulfillment_status='cancelled' THEN RAISE EXCEPTION 'Sales order cancelled'; END IF;
  IF so.fulfillment_status='dispatched' THEN RETURN 0; END IF;
  SELECT COALESCE(p_godown,default_godown_id) INTO def_g FROM public.stock_valuation_settings LIMIT 1;
  IF def_g IS NULL THEN RAISE EXCEPTION 'Default dispatch godown is not configured'; END IF;
  FOR line IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
    SELECT id INTO stock_item FROM public.stock_items WHERE mapped_model_id=line.model_id AND COALESCE(is_active,true) LIMIT 1;
    IF stock_item IS NULL THEN RAISE EXCEPTION 'No finished-goods stock item mapped to model %',line.model_id; END IF;
    PERFORM public.post_stock_issue(stock_item,def_g,line.quantity,CURRENT_DATE,p_idempotency||':'||line.id::text,'sales_order_dispatch',p_order,'sale');
    n:=n+1;
  END LOOP;
  UPDATE public.stock_reservations SET status='consumed' WHERE source_table='sales_orders' AND source_id=p_order AND status='open';
  UPDATE public.sales_orders SET fulfillment_status='dispatched',updated_at=now() WHERE id=p_order;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.produce_sales_order_bom(p_order uuid,p_godown uuid,p_idempotency text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE so public.sales_orders%ROWTYPE; def_g uuid; line record; bom record; stock_item uuid; qty numeric; n integer:=0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'production')) THEN RAISE EXCEPTION 'Production access required'; END IF;
  IF p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  SELECT * INTO so FROM public.sales_orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order not found'; END IF;
  SELECT COALESCE(p_godown,default_godown_id) INTO def_g FROM public.stock_valuation_settings LIMIT 1;
  IF def_g IS NULL THEN RAISE EXCEPTION 'Default production godown is not configured'; END IF;
  FOR line IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
    FOR bom IN SELECT raw_material_id,quantity_per_unit FROM public.model_boq WHERE model_id=line.model_id ORDER BY raw_material_id LOOP
      IF bom.quantity_per_unit<=0 THEN RAISE EXCEPTION 'Invalid BOM quantity'; END IF;
      SELECT id INTO stock_item FROM public.stock_items WHERE mapped_raw_material_id=bom.raw_material_id AND COALESCE(is_active,true) LIMIT 1;
      IF stock_item IS NULL THEN RAISE EXCEPTION 'No stock item mapped to BOM raw material %',bom.raw_material_id; END IF;
      qty:=bom.quantity_per_unit*line.quantity;
      PERFORM public.post_stock_issue(stock_item,def_g,qty,CURRENT_DATE,p_idempotency||':consume:'||line.id::text||':'||bom.raw_material_id::text,'sales_order_bom',p_order,'production_out');
      n:=n+1;
    END LOOP;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_sales_order_finished_goods(p_order uuid,p_godown uuid,p_idempotency text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE so public.sales_orders%ROWTYPE; def_g uuid; line record; bom record; fg_item uuid; qty numeric; consumed_value numeric; rate numeric; mov record; n integer:=0; k text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') AND NOT public.has_role(auth.uid(),'production') THEN RAISE EXCEPTION 'Production access required'; END IF;
  IF p_idempotency IS NULL OR length(trim(p_idempotency))<8 THEN RAISE EXCEPTION 'Idempotency key required'; END IF;
  SELECT * INTO so FROM public.sales_orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sales order not found'; END IF;
  SELECT COALESCE(p_godown,default_godown_id) INTO def_g FROM public.stock_valuation_settings LIMIT 1;
  IF def_g IS NULL THEN RAISE EXCEPTION 'Default production godown is not configured'; END IF;
  FOR line IN SELECT id,model_id,quantity FROM public.sales_order_items WHERE sales_order_id=p_order ORDER BY id LOOP
    consumed_value:=0;
    FOR bom IN SELECT raw_material_id,quantity_per_unit FROM public.model_boq WHERE model_id=line.model_id ORDER BY raw_material_id LOOP
      k:=p_idempotency||':consume:'||line.id::text||':'||bom.raw_material_id::text;
      SELECT * INTO mov FROM public.stock_movements WHERE idempotency_key=k LIMIT 1;
      IF mov.id IS NULL THEN RAISE EXCEPTION 'Production consumption has not been posted'; END IF;
      consumed_value:=consumed_value+COALESCE(mov.amount,0);
    END LOOP;
    SELECT id INTO fg_item FROM public.stock_items WHERE mapped_model_id=line.model_id AND COALESCE(is_active,true) LIMIT 1;
    IF fg_item IS NULL THEN RAISE EXCEPTION 'No finished-goods stock item mapped to model %',line.model_id; END IF;
    IF line.quantity<=0 OR consumed_value<=0 THEN RAISE EXCEPTION 'Finished-goods value cannot be derived from consumption'; END IF;
    rate:=round(consumed_value/line.quantity,6);
    PERFORM public.post_stock_receipt(fg_item,def_g,line.quantity,rate,CURRENT_DATE,p_idempotency||':fg:'||line.id::text,'production',p_order);
    n:=n+1;
  END LOOP;
  RETURN n;
END;
$$;

DROP TRIGGER IF EXISTS pbi_stock_in ON public.purchase_bill_items;
DROP TRIGGER IF EXISTS trg_purchase_item_movement ON public.purchase_bill_items;
DROP TRIGGER IF EXISTS trg_invoice_to_voucher ON public.invoices;
CREATE TRIGGER trg_invoice_to_voucher AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.post_invoice_to_voucher();
DROP TRIGGER IF EXISTS trg_purchase_to_voucher ON public.purchase_bills;
CREATE TRIGGER trg_purchase_to_voucher AFTER INSERT OR UPDATE OF receipt_status ON public.purchase_bills
FOR EACH ROW EXECUTE FUNCTION public.post_purchase_to_voucher();

REVOKE ALL ON FUNCTION public.create_gl_voucher_internal(public.voucher_type,date,jsonb,text,text,text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_gl_voucher(public.voucher_type,date,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.snapshot_invoice_tax(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ensure_invoice_bill(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ensure_purchase_bill(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.post_invoice_to_voucher() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.post_purchase_to_voucher() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.refresh_canonical_bill_status(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_invoice_receipt(uuid,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.post_bill_settlement(public.voucher_type,date,uuid,jsonb,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reverse_gl_voucher(uuid,date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reverse_bill_settlement(uuid,date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reverse_invoice(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_bill(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.post_stock_receipt(uuid,uuid,numeric,numeric,date,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.post_stock_issue(uuid,uuid,numeric,date,text,text,uuid,public.stock_movement_type) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.post_stock_transfer(uuid,uuid,uuid,numeric,date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reverse_stock_movement(uuid,date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_sales_order(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dispatch_sales_order(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.produce_sales_order_bom(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.receive_sales_order_finished_goods(uuid,uuid,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.create_gl_voucher(public.voucher_type,date,jsonb,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_invoice_tax(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_receipt(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_bill_settlement(public.voucher_type,date,uuid,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_gl_voucher(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_bill_settlement(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_invoice(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_bill(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_receipt(uuid,uuid,numeric,numeric,date,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_issue(uuid,uuid,numeric,date,text,text,uuid,public.stock_movement_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_transfer(uuid,uuid,uuid,numeric,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_stock_movement(uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_sales_order(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_sales_order(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.produce_sales_order_bom(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_sales_order_finished_goods(uuid,uuid,text) TO authenticated;
